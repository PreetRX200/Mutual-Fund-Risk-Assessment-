# Mutual Fund Risk Dashboard 

A highly responsive, advanced Mutual Fund AI dashboard and analytics platform driven by a machine-learning backend (XGBoost) and a beautifully designed glassmorphism frontend. Provides detailed Mutual Fund recommendations, "What-If" scenario simulations, and concurrent real-time Portfolio analysis using external data integration.

## Features ✨
- **🧠 ML-Powered Predictor**: Predicts Mutual Fund risk classes and expected metrics using pre-trained XGBoost classifiers and regressors.
- **⚡ Concurrent Live APIs**: Fetches real-time fund analytics (like Expense Ratios, Minimum SIP, NAVs) simultaneously via ThreadPools for lightning-fast speeds.
- **💼 Portfolio Simulator**: Drag-and-drop allocation slider with normalized constraints and auto-updated statistics.
- **🎨 Modern Glassmorphism UI**: High-end styling powered by pure CSS logic and optimized modular JS classes.

## Getting Started ⚙️

### Prerequisites
Make sure you have **Python 3.9+** and `pip` installed on your system.

### Local Installation & Setup

1. **Clone the repository** (or download and extract).
2. **Create a virtual environment**:
   ```bash
   python -m venv venv
   ```
3. **Activate the virtual environment**:
   - **Windows:**
     ```bash
     .\venv\Scripts\activate
     ```
   - **Mac/Linux:**
     ```bash
     source venv/bin/activate
     ```
4. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
5. **Start the backend API server**:
   ```bash
   python flask_api.py
   ```
6. **Open the Dashboard**:
   Open a browser and navigate to exactly:
   [http://localhost:5000](http://localhost:5000)

## Repository Structure 📁

- `flask_api.py`: The heart of the Python backend. Handles all static file serving and JSON logic.
- `frontend/`: The frontend UI container holding `app.js` routing logic and specific feature scripts (`portfolio.js`, `whatif.js`, `api.js`).
- `*.joblib`: Pre-trained ML artifact weights. Let them stay so everything runs natively out of the box!
- `scheme_to_isin.csv` & `mutual_fund_dataset_cleaned.csv`: Cleaned datasets utilized for offline O(1) data bindings and rapid ML ingestion.

## Contributing 🤝

Feel free to fork this project, improve the predictive models (`XGBoost`), or extend the frontend styling architecture. Pull Requests are highly encouraged!
