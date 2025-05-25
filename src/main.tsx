import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from "react-router";
import App from './App.tsx'

const root = document.getElementById('root');
if (root !== null)
    createRoot(root).render(
        <StrictMode>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<App />} />
                    <Route path="/:conversationId" element={<App />} />
                </Routes>
            </BrowserRouter>
        </StrictMode>,
    );
