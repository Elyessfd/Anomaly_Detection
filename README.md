# Predictive Failure Analysis (PFA)

Repository for experimentation with autoencoder-based predictive maintenance models (temperature & vibration).

## Overview

- **Purpose:** Train, evaluate and deploy autoencoder models (Conv1D and LSTM variants) for anomaly detection in equipment sensor data.
- **Data:** Includes sample datasets and scripts to train models, generate representative data for quantization, and run simple inference.

## Repository Structure

- [autoencoder_conv1d_tf.py](autoencoder_conv1d_tf.py): Conv1D autoencoder training script.
- [lstm_autoencoder_tf.py](lstm_autoencoder_tf.py): LSTM autoencoder training script.
- [simple_predict.py](simple_predict.py): Minimal inference example using a saved model.
- [quantize_tflite_int8.py](quantize_tflite_int8.py): Script to quantize a Keras model to TFLite int8.
- [representative_data_gen.py](representative_data_gen.py): Generates representative data for post-training quantization.
- [predictive_maintenance_dataset.csv](predictive_maintenance_dataset.csv): Example dataset for experiments.
- [equipment_anomaly_data.csv](equipment_anomaly_data.csv): Additional sample data.
- [best_model_conv1d_temp.keras](best_model_conv1d_temp.keras) and files in `output/` : Example trained models and output artifacts.

## Quick Start

1. Create a Python environment and install dependencies (example):

```bash
python -m venv .venv
source .venv/Scripts/activate    # Windows: .venv\Scripts\activate
pip install -U pip
pip install tensorflow numpy pandas scikit-learn matplotlib
```

2. Train a model (example):

```bash
python autoencoder_conv1d_tf.py
# or
python lstm_autoencoder_tf.py
```

3. Run a simple prediction using a saved model:

```bash
python simple_predict.py
```

4. Generate representative data and quantize to TFLite (optional):

```bash
python representative_data_gen.py
python quantize_tflite_int8.py --model output/vibration/best_model1_conv1d_vib.keras --output model_quant.tflite
```

## Outputs

- Trained models, representative data and evaluation results are placed under the `output/` folder with subfolders for `temperature/` and `vibration/`.
- Example artifacts: trained Keras models (`*.keras`), `rep_data.npy`, and `threshold_sweep_results.csv`.

## Notes

- Scripts assume input CSVs are available and formatted consistently. Inspect the scripts to confirm column names and preprocessing steps before training.
- Adjust hyperparameters and data windowing inside the training scripts for your dataset and sensors.

## Contact

If you need help running these scripts or adapting them to your data, open an issue or reach out to the repository maintainer.

