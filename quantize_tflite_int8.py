# quantize_tflite_int8.py
import argparse
from pathlib import Path
import numpy as np
import tensorflow as tf


def main():
    parser = argparse.ArgumentParser(description="Full int8 TFLite quantization")
    parser.add_argument("--keras-model", type=str, default="C:\\cudatest\\PFA\\output\\vibration\\best_model_vib.keras")
    parser.add_argument("--rep-data", type=str, default="C:\\cudatest\\PFA\\output\\vibration\\rep_data.npy")
    parser.add_argument("--out", type=str, default="C:\\cudatest\\PFA\\output\\vibration\\best_model_vib_int8.tflite")
    args = parser.parse_args()

    model_path = Path(args.keras_model)
    rep_path = Path(args.rep_data)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if not model_path.exists():
        raise FileNotFoundError(f"Missing keras model: {model_path}")
    if not rep_path.exists():
        raise FileNotFoundError(f"Missing representative data: {rep_path}")

    rep = np.load(rep_path).astype(np.float32)

    def representative_data_gen():
        for i in range(len(rep)):
            yield [rep[i:i+1]]  # shape: (1, seq_len, n_features)

    keras_model = tf.keras.models.load_model(str(model_path))
    converter = tf.lite.TFLiteConverter.from_keras_model(keras_model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.representative_dataset = representative_data_gen
    converter.target_spec.supported_ops = [
    tf.lite.OpsSet.TFLITE_BUILTINS_INT8
    tf.lite.OpsSet.TFLITE_BUILTINS,
    tf.lite.OpsSet.SELECT_TF_OPS  
]

    converter._experimental_lower_tensor_list_ops = False

    converter.inference_input_type = tf.int8
    converter.inference_output_type = tf.int8

    tflite_model = converter.convert()
    out_path.write_bytes(tflite_model)
    print(f"Saved quantized model: {out_path}")


if __name__ == "__main__":
    main()