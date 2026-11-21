import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './app/app.css';
import './app/operations.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
