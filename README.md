# Crypto Dashboard

A full-stack crypto analytics dashboard providing real-time market data, sentiment analysis, and predictive insights.

---

## Overview

This project enables users to:

* Track cryptocurrency prices in real time
* Analyze market trends and sentiment
* View predictive insights
* Monitor portfolio performance

---

## Features

### Market Data

* Real-time price tracking
* Historical data analysis
* Market indicators

### Analytics

* Sentiment analysis
* Prediction module

### Portfolio

* Track holdings
* Monitor profit and loss

### Real-Time Updates

* WebSocket-based live updates

---

## Project Structure

```
crypto-dashboard/
│
├── backend/
│   ├── analytics/       # Indicators and prediction logic
│   ├── config/          # Configuration files (DB, environment)
│   ├── models/          # Data models
│   ├── routes/          # API endpoints
│   ├── services/        # Business logic and API integrations
│   ├── sockets/         # WebSocket handlers
│   ├── tests/           # Test cases
│   └── server.js        # Application entry point
│
├── frontend/
│   ├── css/             # Stylesheets
│   ├── js/              # Frontend scripts
│   └── index.html       # Main UI
│
├── .gitignore           # Ignored files
├── package.json         # Project metadata and dependencies
├── package-lock.json    # Dependency lock file
├── render.yaml          # Deployment configuration
```

---

## Tech Stack

Backend:

* Node.js
* Express.js
* WebSockets

Frontend:

* HTML
* CSS
* JavaScript

---

## Setup and Installation

1. Clone the repository
   git clone https://github.com/SivaAditya11/crypto-dashboard.git

2. Navigate to the project directory
   cd crypto-dashboard

3. Install dependencies
   npm install

4. Create a `.env` file
   PORT=5000
   API_KEY=your_api_key

5. Start the application
   npm start

---

## Usage

Open the application in your browser and explore:

* Cryptocurrency market data
* Analytics and predictions
* Portfolio tracking

---

## Testing

Run test files from the backend directory:

```
node backend/tests/test_fetch.js
```

---

## Deployment

This project includes a `render.yaml` file and can be deployed using Render.

Steps:

* Push code to GitHub
* Connect repository to Render
* Deploy using configuration

---

## Future Improvements

* Authentication system
* Machine learning-based predictions
* Advanced charts and visualizations
* Mobile responsiveness

---

## Author

Siva Aditya
https://github.com/SivaAditya11

---

## License

This project is for educational purposes.
