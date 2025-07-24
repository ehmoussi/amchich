import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from "react-router";
import { AppConversation, AppLandingPage } from './App.tsx'
import { CookiesProvider } from 'react-cookie';

const root = document.getElementById('root');
if (root !== null)
    createRoot(root).render(
        <StrictMode>
            <CookiesProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<AppLandingPage />} />
                        <Route path="/:conversationId" element={<AppConversation />} />
                    </Routes>
                </BrowserRouter>
            </CookiesProvider>
        </StrictMode >,
    );
