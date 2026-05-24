# make_representative_dataset.py
import argparse
from pathlib import Path
import numpy as np

from lstm_autoencoder_tf import load_data, preprocess, build_all_sequences, SEQUENCE_LENGTH


def main():
    parser = argparse.ArgumentParser(description="Build representative dataset for TFLite PTQ")
    parser.add_argument("--data", type=str, default="predictive_maintenance_dataset.csv")
    parser.add_argument("--out", type=str, default="C:\\cudatest\\PFA\\output\\vibration\\rep_data.npy")
    parser.add_argument("--samples", type=int, default=300)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    np.random.seed(args.seed)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    df = load_data(args.data)
    df_scaled, _, feature_cols = preprocess(df)

    # Use normal windows for calibration
    X_train, _, _ = build_all_sequences(
        df_scaled, feature_cols, SEQUENCE_LENGTH, normal_only=True
    )

    n = min(args.samples, len(X_train))
    idx = np.random.choice(len(X_train), size=n, replace=False)
    rep = X_train[idx].astype(np.float32)  # shape: (n, seq_len, n_features)

    np.save(out_path, rep)
    print(f"Saved representative dataset: {out_path}")
    print(f"Shape: {rep.shape}")


if __name__ == "__main__":
    main()