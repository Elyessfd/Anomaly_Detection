from pathlib import Path
import argparse

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.metrics import accuracy_score, confusion_matrix
from tensorflow import keras

from lstm_autoencoder_tf import (
    SEQUENCE_LENGTH,
    load_data,
    preprocess,
    build_all_sequences,
    reconstruction_errors,
)


BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "predictive_maintenance_dataset.csv"
MODEL_PATH = BASE_DIR / "best_model_conv1d_temp.keras"


def evaluate_thresholds(y_true: np.ndarray, errors: np.ndarray, thresholds: np.ndarray) -> pd.DataFrame:
    rows = []
    for t in thresholds:
        y_pred = (errors > t).astype(int)
        acc = accuracy_score(y_true, y_pred)
        cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
        tn, fp, fn, tp = cm.ravel()

        # Metrics for the anomaly class (label=1)
        precision_anomaly = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall_anomaly = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1_anomaly = (
            (2 * precision_anomaly * recall_anomaly) / (precision_anomaly + recall_anomaly)
            if (precision_anomaly + recall_anomaly) > 0
            else 0.0
        )

        # Metrics for the normal class (label=0)
        precision_normal = tn / (tn + fn) if (tn + fn) > 0 else 0.0
        recall_normal = tn / (tn + fp) if (tn + fp) > 0 else 0.0
        f1_normal = (
            (2 * precision_normal * recall_normal) / (precision_normal + recall_normal)
            if (precision_normal + recall_normal) > 0
            else 0.0
        )

        # Aggregate metrics for imbalanced data
        specificity = tn / (tn + fp) if (tn + fp) > 0 else 0.0
        balanced_accuracy = (recall_anomaly + specificity) / 2.0
        precision_macro = (precision_anomaly + precision_normal) / 2.0
        recall_macro = (recall_anomaly + recall_normal) / 2.0
        f1_macro = (f1_anomaly + f1_normal) / 2.0

        support_normal = tn + fp
        support_anomaly = tp + fn
        total_support = support_normal + support_anomaly
        precision_weighted = (
            (precision_normal * support_normal + precision_anomaly * support_anomaly) / total_support
            if total_support > 0
            else 0.0
        )
        recall_weighted = (
            (recall_normal * support_normal + recall_anomaly * support_anomaly) / total_support
            if total_support > 0
            else 0.0
        )
        f1_weighted = (
            (f1_normal * support_normal + f1_anomaly * support_anomaly) / total_support
            if total_support > 0
            else 0.0
        )

        rows.append(
            {
                "threshold": float(t),
                "accuracy": float(acc),
                "precision_anomaly": float(precision_anomaly),
                "recall_anomaly": float(recall_anomaly),
                "f1_anomaly": float(f1_anomaly),
                "precision_normal": float(precision_normal),
                "recall_normal": float(recall_normal),
                "f1_normal": float(f1_normal),
                "specificity": float(specificity),
                "balanced_accuracy": float(balanced_accuracy),
                "precision_macro": float(precision_macro),
                "recall_macro": float(recall_macro),
                "f1_macro": float(f1_macro),
                "precision_weighted": float(precision_weighted),
                "recall_weighted": float(recall_weighted),
                "f1_weighted": float(f1_weighted),
                "tn": int(tn),
                "fp": int(fp),
                "fn": int(fn),
                "tp": int(tp),
            }
        )

    results = pd.DataFrame(rows).sort_values("threshold").reset_index(drop=True)
    return results


def plot_metrics(results: pd.DataFrame, output_path: Path):
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.plot(results["threshold"], results["accuracy"], label="Accuracy", linewidth=2)
    ax.plot(results["threshold"], results["precision_anomaly"], label="Precision (Anomaly)", linewidth=2)
    ax.plot(results["threshold"], results["precision_normal"], label="Precision (Normal)", linewidth=2)
    ax.plot(results["threshold"], results["precision_weighted"], label="Precision (Weighted)", linewidth=2)
    ax.plot(results["threshold"], results["recall_anomaly"], label="Recall (Anomaly)", linewidth=2)
    ax.plot(results["threshold"], results["f1_anomaly"], label="F1 (Anomaly)", linewidth=2)
    ax.plot(results["threshold"], results["balanced_accuracy"], label="Balanced Accuracy", linewidth=2)

    ax.set_title("Threshold Sweep Metrics")
    ax.set_xlabel("Threshold")
    ax.set_ylabel("Score")
    ax.set_ylim(0, 1.02)
    ax.grid(True, alpha=0.3)
    ax.legend()

    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def save_best_confusion_matrix(y_true: np.ndarray, errors: np.ndarray, best_threshold: float, output_path: Path):
    y_pred = (errors > best_threshold).astype(int)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])

    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(cm, cmap="Blues")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

    labels = ["Normal", "Anomaly"]
    ax.set_xticks([0, 1])
    ax.set_yticks([0, 1])
    ax.set_xticklabels(labels)
    ax.set_yticklabels(labels)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title(f"Best F1 Confusion Matrix (t={best_threshold:.6f})")

    thresh = cm.max() / 2.0 if cm.max() > 0 else 0.5
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(
                j,
                i,
                f"{cm[i, j]}",
                ha="center",
                va="center",
                color="white" if cm[i, j] > thresh else "black",
            )

    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def build_thresholds_from_train_errors(train_errors: np.ndarray, pct_start: float, pct_end: float, points: int) -> np.ndarray:
    percentiles = np.linspace(pct_start, pct_end, points)
    thresholds = np.percentile(train_errors, percentiles)
    return np.unique(thresholds)


def main():
    parser = argparse.ArgumentParser(description="Sweep anomaly thresholds for the trained autoencoder")
    parser.add_argument("--data", type=str, default=str(DATA_PATH), help="Path to CSV dataset")
    parser.add_argument("--model", type=str, default=str(MODEL_PATH), help="Path to trained Keras model")
    parser.add_argument(
        "--thresholds",
        type=float,
        nargs="+",
        default=None,
        help="Manual threshold values (example: --thresholds 0.001 0.002 0.003)",
    )
    parser.add_argument("--pct-start", type=float, default=90.0, help="Start percentile for threshold sweep")
    parser.add_argument("--pct-end", type=float, default=99.9, help="End percentile for threshold sweep")
    parser.add_argument("--points", type=int, default=30, help="Number of percentiles in sweep")
    parser.add_argument("--out-csv", type=str, default="threshold_sweep_results.csv", help="Output CSV filename")
    parser.add_argument("--out-plot", type=str, default="threshold_sweep_metrics.png", help="Output metrics plot filename")
    parser.add_argument(
        "--out-cm",
        type=str,
        default="confusion_matrix_best_threshold.png",
        help="Output confusion matrix filename for best F1 threshold",
    )
    args = parser.parse_args()

    data_path = Path(args.data)
    model_path = Path(args.model)
    if not data_path.exists():
        raise FileNotFoundError(f"Dataset not found: {data_path}")
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    print(f"Loading model: {model_path}")
    model = keras.models.load_model(model_path)

    df = load_data(str(data_path))
    df_scaled, _, feature_cols = preprocess(df)

    print("Building test sequences...")
    X_test, y_test, _ = build_all_sequences(df_scaled, feature_cols, SEQUENCE_LENGTH, normal_only=False)

    print("Computing reconstruction errors on test data...")
    test_errors = reconstruction_errors(model, X_test)

    if args.thresholds is not None:
        thresholds = np.unique(np.array(args.thresholds, dtype=float))
        print(f"Using manual thresholds: {thresholds.tolist()}")
    else:
        print("Building train sequences for percentile-based thresholds...")
        X_train, _, _ = build_all_sequences(df_scaled, feature_cols, SEQUENCE_LENGTH, normal_only=True)
        train_errors = reconstruction_errors(model, X_train)
        thresholds = build_thresholds_from_train_errors(
            train_errors, args.pct_start, args.pct_end, args.points
        )
        print(
            "Using percentile-based thresholds from train errors: "
            f"pct_start={args.pct_start}, pct_end={args.pct_end}, points={args.points}"
        )

    results = evaluate_thresholds(y_test, test_errors, thresholds)

    out_csv = BASE_DIR / args.out_csv
    out_plot = BASE_DIR / args.out_plot
    out_cm = BASE_DIR / args.out_cm

    results.to_csv(out_csv, index=False)
    plot_metrics(results, out_plot)

    best_idx = results["f1_anomaly"].idxmax()
    best_row = results.loc[best_idx]
    best_threshold = float(best_row["threshold"])
    save_best_confusion_matrix(y_test, test_errors, best_threshold, out_cm)

    print("\nThreshold sweep complete")
    print(f"Saved results CSV: {out_csv}")
    print(f"Saved metrics plot: {out_plot}")
    print(f"Saved best confusion matrix: {out_cm}")
    print(
        "Best threshold -> "
        f"t={best_threshold:.6f} | "
        f"F1(anomaly)={best_row['f1_anomaly']:.4f} | "
        f"Precision(anomaly)={best_row['precision_anomaly']:.4f} | "
        f"Precision(normal)={best_row['precision_normal']:.4f} | "
        f"Precision(weighted)={best_row['precision_weighted']:.4f} | "
        f"Recall(anomaly)={best_row['recall_anomaly']:.4f} | "
        f"Accuracy={best_row['accuracy']:.4f}"
    )


if __name__ == "__main__":
    main()
