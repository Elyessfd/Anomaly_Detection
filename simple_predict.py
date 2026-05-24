import numpy as np
from tensorflow import keras
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "output" / "vibration" / "best_model_vib.keras"

THRESHOLD = 0.18

# Manual sequence (SEQUENCE_LENGTH=2, one feature=vibration)
raw_seq = [0.11, 0.96]

# Option A: if values are already normalized [0..1], use directly:
x = np.array(raw_seq, dtype=np.float32)

# Option B: if raw sensor values, scale with training constants:
# VIB_MIN = ...
# VIB_MAX = ...
# x = (np.array(raw_seq, dtype=np.float32) - VIB_MIN) / (VIB_MAX - VIB_MIN + 1e-12)

X = x.reshape(1, 2, 1)  # (batch, seq_len, n_features)

model = keras.models.load_model(MODEL_PATH)
X_hat = model.predict(X, verbose=0)
err = float(np.mean((X - X_hat) ** 2))
pred = int(err > THRESHOLD)

print("error:", err)
print("prediction:", pred, "ANOMALY" if pred == 1 else "NORMAL")