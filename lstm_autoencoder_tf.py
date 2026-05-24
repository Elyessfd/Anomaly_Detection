"""
LSTM Autoencoder for Temperature Anomaly Detection — TensorFlow / Keras
Multi-machine strategy: ONE shared model trained on all machines together.

The key fix vs. a naive concat:
  - Sequences are built WITHIN each machine (no cross-machine windows)
  - Scaler is fit on per-machine normal data then applied globally
  - Evaluation reports per-machine metrics so you can spot if one machine
    is harder to detect than others

Dataset columns: timestamp, machine_id, vibration, acoustic, temperature,
                 current, IMF_1, IMF_2, IMF_3, label
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, Model, callbacks
import warnings
warnings.filterwarnings("ignore")

BASE_DIR = Path(__file__).resolve().parent

# ─────────────────────────────────────────────
# 1. CONFIG
# ─────────────────────────────────────────────
SEQUENCE_LENGTH = 2
BATCH_SIZE      = 32
EPOCHS          = 150
LEARNING_RATE   = 1e-3
HIDDEN_UNITS    = 128
LATENT_DIM      = 2
DROPOUT_RATE    = 0.2
THRESHOLD_PCT   = 99    # percentile of train errors → anomaly threshold
EARLY_STOP_PAT  = 30

FEATURE_COLS = ["vibration"]

print("TensorFlow version:", tf.__version__)
print("GPUs:", tf.config.list_physical_devices("GPU"))

# ─────────────────────────────────────────────
# 2. DATA LOADING
# ─────────────────────────────────────────────
def load_data(filepath: str) -> pd.DataFrame:
    df = pd.read_csv(filepath, parse_dates=["timestamp"])
    df = df.sort_values(["machine_id", "timestamp"]).reset_index(drop=True)
    cols = ["timestamp", "machine_id", "label"] + FEATURE_COLS
    df   = df[[c for c in cols if c in df.columns]]
    machines = df["machine_id"].unique().tolist()
    print(f"Loaded {len(df):,} rows | machines: {machines}")
    for m in machines:
        sub = df[df["machine_id"] == m]
        print(f"  {m}: {len(sub):,} rows | anomaly rate: {sub['label'].mean():.2%}")
    return df


# ─────────────────────────────────────────────
# 3. PREPROCESSING  (machine-aware)
# ─────────────────────────────────────────────
def preprocess(df: pd.DataFrame):
    """
    Fit ONE MinMaxScaler on ALL normal data across all machines,
    then apply it to the full dataset.

    Why one scaler?
      A shared model needs a shared feature space. Fitting on all-machine
      normal data captures the global normal range, so M01's 70°C and
      M03's 70°C map to the same scaled value — the model learns ONE
      notion of normality across all three machines.
    """
    feature_cols = [c for c in FEATURE_COLS if c in df.columns]

    normal_mask = df["label"] == 0
    scaler      = MinMaxScaler()
    scaler.fit(df.loc[normal_mask, feature_cols])   # fit on ALL-machine normal rows

    df_scaled = df.copy()
    df_scaled[feature_cols] = scaler.transform(df[feature_cols])
    return df_scaled, scaler, feature_cols


# ─────────────────────────────────────────────
# 4. SEQUENCE CREATION  (per-machine, no leakage)
# ─────────────────────────────────────────────
def make_sequences_for_machine(machine_df: pd.DataFrame,
                                feature_cols: list,
                                seq_len: int,
                                normal_only: bool = False):
    """
    Sliding window built strictly within one machine's timeline.

    FIX: When normal_only=True, we no longer drop anomaly rows before
    windowing (which would stitch non-consecutive timestamps together).
    Instead, we slide over the FULL timeline and skip any window that
    contains at least one anomaly timestep.
    """
    data   = machine_df[feature_cols].values.astype(np.float32)
    labels = machine_df["label"].values.astype(np.int32)
    X, y   = [], []
    for i in range(len(data) - seq_len + 1):
        window_labels = labels[i : i + seq_len]
        if normal_only and window_labels.any():   # skip if ANY anomaly in window
            continue
        X.append(data[i : i + seq_len])
        y.append(labels[i + seq_len - 1])         # label of the last timestep
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int32)


def build_all_sequences(df_scaled: pd.DataFrame,
                         feature_cols: list,
                         seq_len: int,
                         normal_only: bool = False):
    """
    Iterate over each machine independently, build sequences,
    then concatenate. Returns a machine_id array for per-machine metrics.

    FIX: Label filtering is removed from here entirely.
    make_sequences_for_machine handles it at the window level,
    so the full consecutive timeline is always passed in.

    normal_only=True  → training set (fully-normal windows only)
    normal_only=False → test set     (all windows)
    """
    X_all, y_all, mach_all = [], [], []
    for machine_id, grp in df_scaled.groupby("machine_id", sort=True):
        grp = grp.sort_values("timestamp")
        # ── FIX: no label pre-filtering here ──────────────────────────────
        if len(grp) < seq_len:
            print(f"  WARNING: {machine_id} has fewer rows than seq_len, skipping.")
            continue
        X_m, y_m = make_sequences_for_machine(grp, feature_cols, seq_len, normal_only)
        if len(X_m) == 0:
            print(f"  WARNING: {machine_id} produced 0 sequences — check normal_only setting.")
            continue
        X_all.append(X_m)
        y_all.append(y_m)
        mach_all.extend([machine_id] * len(X_m))
        print(f"  {machine_id}: {len(X_m):,} sequences")

    X        = np.concatenate(X_all, axis=0)
    y        = np.concatenate(y_all, axis=0)
    machines = np.array(mach_all)
    return X, y, machines


# ─────────────────────────────────────────────
# 5. MODEL
# ─────────────────────────────────────────────
def build_lstm_autoencoder(seq_len: int, n_features: int) -> Model:
    inputs = keras.Input(shape=(seq_len, n_features), name="input")

    # ── Encoder ──────────────────────────────
    x      = layers.LSTM(HIDDEN_UNITS, return_sequences=True,
                         dropout=DROPOUT_RATE, name="enc_lstm_1")(inputs)
    x      = layers.LSTM(HIDDEN_UNITS // 2, return_sequences=False,
                         dropout=DROPOUT_RATE, name="enc_lstm_2")(x)
    latent = layers.Dense(LATENT_DIM, activation="relu", name="latent")(x)

    # ── Decoder ──────────────────────────────
    x      = layers.RepeatVector(seq_len, name="repeat")(latent)
    x      = layers.LSTM(HIDDEN_UNITS // 2, return_sequences=True,
                         dropout=DROPOUT_RATE, name="dec_lstm_1")(x)
    x      = layers.LSTM(HIDDEN_UNITS, return_sequences=True,
                         dropout=DROPOUT_RATE, name="dec_lstm_2")(x)
    output = layers.TimeDistributed(
        layers.Dense(n_features), name="reconstruction"
    )(x)

    model = Model(inputs, output, name="LSTM_Autoencoder_Shared")
    model.compile(
        optimizer=keras.optimizers.Adam(LEARNING_RATE),
        loss="mse", metrics=["mae"]
    )
    return model


# ─────────────────────────────────────────────
# 6. ANOMALY SCORING
# ─────────────────────────────────────────────
def reconstruction_errors(model: Model, X: np.ndarray) -> np.ndarray:
    X_hat = model.predict(X, batch_size=256, verbose=0)
    return np.mean((X - X_hat) ** 2, axis=(1, 2))   # (N,)


# ─────────────────────────────────────────────
# 7. EVALUATION  (global + per-machine)
# ─────────────────────────────────────────────
def evaluate_all(errors, y_true, machine_ids, threshold):
    y_pred = (errors > threshold).astype(int)

    print("\n══ GLOBAL RESULTS ════════════════════════════")
    print(classification_report(y_true, y_pred,
                                target_names=["Normal", "Anomaly"]))
    print("Confusion Matrix:\n", confusion_matrix(y_true, y_pred))
    if len(np.unique(y_true)) == 2:
        print(f"ROC-AUC: {roc_auc_score(y_true, errors):.4f}")

    print("\n══ PER-MACHINE RESULTS ═══════════════════════")
    for m in sorted(np.unique(machine_ids)):
        mask = machine_ids == m
        e_m  = errors[mask]
        y_m  = y_true[mask]
        y_p  = (e_m > threshold).astype(int)
        print(f"\n── {m}  (anomaly rate: {y_m.mean():.2%}, "
              f"n={mask.sum():,}) ──")
        print(classification_report(y_m, y_p,
                                    target_names=["Normal", "Anomaly"],
                                    zero_division=0))
        if len(np.unique(y_m)) == 2:
            print(f"  ROC-AUC: {roc_auc_score(y_m, e_m):.4f}")


# ─────────────────────────────────────────────
# 8. PLOTTING
# ─────────────────────────────────────────────
def save_training_history(history, output_csv: str = "training_history_vib.csv"):
    output_path = BASE_DIR / output_csv
    history_df = pd.DataFrame(history.history)
    history_df.insert(0, "epoch", np.arange(1, len(history_df) + 1))
    history_df.to_csv(output_path, index=False)
    print(f"Saved training history -> {output_path}")


def plot_results(history, errors_test, y_test, machine_ids_test, threshold):
    machines = sorted(np.unique(machine_ids_test))
    n_mach   = len(machines)
    colors   = ["steelblue", "seagreen", "darkorange"]

    fig = plt.figure(figsize=(18, 5 + 4 * n_mach))
    fig.suptitle("LSTM Autoencoder — Shared Model, All Machines",
                 fontsize=13, fontweight="bold")

    # ── Row 1: global view ──────────────────
    ax1 = fig.add_subplot(n_mach + 1, 3, 1)
    ax1.plot(history.history["loss"],     label="Train")
    ax1.plot(history.history["val_loss"], label="Val")
    ax1.set_title("Loss Curves"); ax1.set_xlabel("Epoch")
    ax1.legend(); ax1.grid(True, alpha=0.3)

    ax2 = fig.add_subplot(n_mach + 1, 3, 2)
    ax2.hist(errors_test[y_test == 0], bins=60, alpha=0.6,
             color="steelblue", label="Normal")
    ax2.hist(errors_test[y_test == 1], bins=60, alpha=0.6,
             color="tomato",    label="Anomaly")
    ax2.axvline(threshold, color="k", linestyle="--",
                label=f"Threshold={threshold:.5f}")
    ax2.set_title("Error Distribution — All Machines")
    ax2.legend(); ax2.grid(True, alpha=0.3)

    ax3 = fig.add_subplot(n_mach + 1, 3, 3)
    ax3.plot(errors_test, color="grey", linewidth=0.6, label="Recon Error")
    ax3.axhline(threshold, color="red", linestyle="--", linewidth=1.2)
    det = np.where(errors_test > threshold)[0]
    ax3.scatter(det, errors_test[det], color="red", s=8, zorder=5,
                label="Anomaly")
    ax3.set_title("Anomaly Score — All Machines")
    ax3.legend(fontsize=8); ax3.grid(True, alpha=0.3)

    # ── Rows 2+: one row per machine ────────
    for idx, m in enumerate(machines):
        mask = machine_ids_test == m
        e_m  = errors_test[mask]
        y_m  = y_test[mask]
        col  = colors[idx % len(colors)]
        row  = idx + 1

        # error distribution
        ax_d = fig.add_subplot(n_mach + 1, 3, row * 3 + 2)
        ax_d.hist(e_m[y_m == 0], bins=40, alpha=0.6,
                  color=col,     label="Normal")
        ax_d.hist(e_m[y_m == 1], bins=40, alpha=0.6,
                  color="tomato", label="Anomaly")
        ax_d.axvline(threshold, color="k", linestyle="--")
        ax_d.set_title(f"{m} — Error Distribution")
        ax_d.legend(fontsize=8); ax_d.grid(True, alpha=0.3)

        # timeline
        ax_t = fig.add_subplot(n_mach + 1, 3, row * 3 + 3)
        ax_t.plot(e_m, color=col, linewidth=0.7)
        ax_t.axhline(threshold, color="red", linestyle="--", linewidth=1.2)
        det_m = np.where(e_m > threshold)[0]
        ax_t.scatter(det_m, e_m[det_m], color="red", s=8, zorder=5)
        ax_t.set_title(f"{m} — Anomaly Score Timeline")
        ax_t.grid(True, alpha=0.3)

    plt.tight_layout()
    out_path = BASE_DIR / "anomaly_results_shared_vib.png"
    plt.savefig(out_path, dpi=150)
    print(f"Saved -> {out_path}")
    plt.close(fig)


def plot_confusion_matrix_figure(y_true, errors_test, threshold,
                                 output_path: str = "confusion_matrix_shared_vib.png"):
    y_pred = (errors_test > threshold).astype(int)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])

    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(cm, cmap="Blues")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

    labels = ["Normal", "Anomaly"]
    ax.set_xticks([0, 1]); ax.set_yticks([0, 1])
    ax.set_xticklabels(labels); ax.set_yticklabels(labels)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title("Confusion Matrix")

    thresh = cm.max() / 2.0 if cm.max() > 0 else 0.5
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, f"{cm[i, j]}",
                    ha="center", va="center",
                    color="white" if cm[i, j] > thresh else "black")

    fig.tight_layout()
    out_path = BASE_DIR / output_path
    fig.savefig(out_path, dpi=150)
    print(f"Saved -> {out_path}")
    plt.close(fig)


# ─────────────────────────────────────────────
# 9. MAIN PIPELINE
# ─────────────────────────────────────────────
def main(filepath: str = "C:\\cudatest\\PFA\\predictive_maintenance_dataset.csv"):

    df = load_data(filepath)
    df_scaled, scaler, feature_cols = preprocess(df)

    # Build sequences per-machine, then concatenate
    print("\nBuilding TRAIN sequences (normal only, all machines):")
    X_train, y_train, mach_train = build_all_sequences(
        df_scaled, feature_cols, SEQUENCE_LENGTH, normal_only=True
    )
    print("\nBuilding TEST sequences (all labels, all machines):")
    X_test, y_test, mach_test = build_all_sequences(
        df_scaled, feature_cols, SEQUENCE_LENGTH, normal_only=False
    )

    print(f"\nTotal train: {X_train.shape} | Total test: {X_test.shape}")

    # 80/20 validation split (shuffle to mix machines)
    idx    = np.random.permutation(len(X_train))
    X_train, y_train, mach_train = X_train[idx], y_train[idx], mach_train[idx]
    split  = int(0.8 * len(X_train))
    X_tr   = X_train[:split];  X_val = X_train[split:]

    # Build & train model
    model = build_lstm_autoencoder(SEQUENCE_LENGTH, len(feature_cols))
    model.summary()

    cb_list = [
        callbacks.EarlyStopping(monitor="val_loss", patience=EARLY_STOP_PAT,
                                restore_best_weights=True, verbose=1),
        callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5,
                                    patience=5, min_lr=1e-6, verbose=1),
        callbacks.ModelCheckpoint("best_model_vib.keras", monitor="val_loss",
                                  save_best_only=True, verbose=0),
    ]

    print("\n── Training shared model on M01 + M02 + M03 ──")
    history = model.fit(
        X_tr, X_tr,                        # autoencoder: target = input
        validation_data=(X_val, X_val),
        epochs=EPOCHS, batch_size=BATCH_SIZE,
        callbacks=cb_list, verbose=1
    )
    save_training_history(history, "training_history_vib.csv")

    # Threshold from training reconstruction errors
    train_errors = reconstruction_errors(model, X_train)
    threshold    = 0.2
    print(f"\nThreshold ({THRESHOLD_PCT}th pct): {threshold:.6f}")

    # Evaluate globally + per machine
    test_errors = reconstruction_errors(model, X_test)
    evaluate_all(test_errors, y_test, mach_test, threshold)

    # Plot
    plot_results(history, test_errors, y_test, mach_test, threshold)
    plot_confusion_matrix_figure(y_test, test_errors, threshold)

    return model, scaler, threshold, feature_cols


# ─────────────────────────────────────────────
# 10. INFERENCE HELPER
# ─────────────────────────────────────────────
def predict_new(model: Model, scaler: MinMaxScaler, threshold: float,
                feature_cols: list, new_df: pd.DataFrame,
                seq_len: int = SEQUENCE_LENGTH) -> dict:
    """Score new data — handles multiple machines automatically."""
    all_errors, all_preds, all_machines = [], [], []
    for machine_id, grp in new_df.groupby("machine_id", sort=True):
        grp_s = grp.copy()
        grp_s[feature_cols] = scaler.transform(grp[feature_cols])
        X_m, _ = make_sequences_for_machine(
            grp_s.sort_values("timestamp"), feature_cols, seq_len
        )
        e_m = reconstruction_errors(model, X_m)
        all_errors.extend(e_m)
        all_preds.extend((e_m > threshold).astype(int))
        all_machines.extend([machine_id] * len(e_m))

    return {
        "machine_ids"           : np.array(all_machines),
        "reconstruction_errors" : np.array(all_errors),
        "predictions"           : np.array(all_preds),
    }


if __name__ == "__main__":
    model, scaler, threshold, feature_cols = main("C:\\cudatest\\PFA\\predictive_maintenance_dataset.csv")
    