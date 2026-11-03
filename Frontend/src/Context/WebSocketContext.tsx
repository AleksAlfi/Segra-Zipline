import { createContext, useContext, ReactNode, useCallback, useEffect, useState } from 'react';
import { sendMessageToBackend } from '../Utils/MessageUtils';

interface WebSocketContextType {
  sendMessage: (message: string) => void;
  isConnected: boolean;
  connectionState: number;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketMessage {
  method: string;
  content: any;
}

const SOCKET_URL = 'ws://localhost:44030/';
const RECONNECT_INTERVAL_MS = 3000;

// The heartbeat closes the socket if no message arrives within the timeout, and otherwise
// sends 'ping' every interval. While the Segra window is backgrounded during gameplay,
// Chromium/WebView2 throttles timers to fire at most about once every 60 seconds. The
// interval must stay below that floor so each throttled tick still emits a ping (which the
// backend answers, resetting the timeout), and the timeout must stay well above it so one
// slow tick can't trip the close.
const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 120000;

// The socket opens when this module loads, before the first render, so the backend's first
// pushes overlap it. Messages are held until the providers below have subscribed.
let socket: WebSocket;
let lastMessageAt = 0;
let subscribed = false;
const heldMessages: WebSocketMessage[] = [];
const stateListeners = new Set<(state: number) => void>();

function dispatchMessage(data: WebSocketMessage) {
  window.dispatchEvent(new CustomEvent('websocket-message', { detail: data }));
}

function connect() {
  const ws = new WebSocket(SOCKET_URL);
  socket = ws;
  stateListeners.forEach((listener) => listener(ws.readyState));

  ws.onopen = () => {
    console.log('WebSocket connected');
    lastMessageAt = Date.now();
    // The backend replies with settings, state and the current AuthState
    sendMessageToBackend('NewConnection');
    stateListeners.forEach((listener) => listener(ws.readyState));
  };
  ws.onmessage = (event) => {
    lastMessageAt = Date.now();
    try {
      const data: WebSocketMessage = JSON.parse(event.data);
      if (data.method !== 'RecordingPreviewFrame') {
        console.log('WebSocket message received:', data);
      }
      if (subscribed) dispatchMessage(data);
      else heldMessages.push(data);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };
  ws.onerror = (event) => {
    console.error('WebSocket error:', event);
  };
  ws.onclose = (event) => {
    console.warn('WebSocket closed, will attempt to reconnect:', event.code, event.reason);
    stateListeners.forEach((listener) => listener(ws.readyState));
    setTimeout(connect, RECONNECT_INTERVAL_MS);
  };
}

connect();

setInterval(() => {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (Date.now() - lastMessageAt > HEARTBEAT_TIMEOUT_MS) {
    socket.close();
    return;
  }
  socket.send('ping');
}, HEARTBEAT_INTERVAL_MS);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [readyState, setReadyState] = useState<number>(socket.readyState);

  useEffect(() => {
    stateListeners.add(setReadyState);
    setReadyState(socket.readyState);

    // Effects run children first, so every provider below has subscribed by now
    subscribed = true;
    heldMessages.splice(0).forEach(dispatchMessage);

    return () => {
      subscribed = false;
      stateListeners.delete(setReadyState);
    };
  }, []);

  const contextValue = {
    sendMessage: useCallback((message: string) => {
      sendMessageToBackend(message);
    }, []),
    isConnected: readyState === WebSocket.OPEN,
    connectionState: readyState,
  };

  return <WebSocketContext.Provider value={contextValue}>{children}</WebSocketContext.Provider>;
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}
