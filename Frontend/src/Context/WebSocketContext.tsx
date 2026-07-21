import { createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { sendMessageToBackend } from '../Utils/MessageUtils';

interface WebSocketContextType {
  sendMessage: (message: string) => void;
  isConnected: boolean;
  connectionState: ReadyState;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketMessage {
  method: string;
  content: any;
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  // Ref to track if we've already handled a version mismatch (prevent multiple reloads)
  const versionCheckHandled = useRef(false);
  // Ref to track if this is a reconnection (not initial connection)
  const hasConnectedBefore = useRef(false);

  // Configure WebSocket with reconnection and heartbeat
  const { readyState } = useWebSocket('ws://localhost:44030/', {
    onOpen: () => {
      // Check if this is a reconnection
      if (hasConnectedBefore.current) {
        console.log('WebSocket reconnected after disconnect - resyncing state');
      } else {
        console.log('WebSocket connected for the first time');
        hasConnectedBefore.current = true;
      }

      // The backend replies with settings, state and the current AuthState
      sendMessageToBackend('NewConnection');
    },
    onClose: (event) => {
      console.warn('WebSocket closed:', event.code, event.reason);
    },
    onError: (event) => {
      console.error('WebSocket error:', event);
    },
    onMessage: (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        if (data.method !== 'RecordingPreviewFrame') {
          console.log('WebSocket message received:', data);
        }

        // Handle version check
        if (data.method === 'AppVersion' && !versionCheckHandled.current) {
          versionCheckHandled.current = true;
          const backendVersion = data.content?.version;

          if (backendVersion && backendVersion !== __APP_VERSION__) {
            // A reload only helps when the served bundle actually matches the backend after
            // an update. If we already reloaded once for this backend version and still
            // mismatch (e.g. a build whose frontend version wasn't stamped), reloading
            // again would loop forever.
            if (localStorage.getItem('versionReloadAttempted') === backendVersion) {
              console.warn(
                `Version mismatch persists after reload (Backend ${backendVersion}, Frontend ${__APP_VERSION__}); not reloading again.`,
              );
              return;
            }
            console.log(
              `Version mismatch: Backend ${backendVersion}, Frontend ${__APP_VERSION__}. Reloading...`,
            );
            localStorage.setItem('versionReloadAttempted', backendVersion);
            // Store the old version before reloading
            localStorage.setItem('oldAppVersion', __APP_VERSION__);
            window.location.reload();
            return;
          }
          localStorage.removeItem('versionReloadAttempted');
        }

        // Dispatch the message to all listeners
        window.dispatchEvent(
          new CustomEvent('websocket-message', {
            detail: data,
          }),
        );
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    },
    shouldReconnect: () => {
      console.log('WebSocket closed, will attempt to reconnect');
      return true;
    },
    reconnectAttempts: Infinity,
    reconnectInterval: 3000,
    // The heartbeat closes the socket if no message arrives within `timeout`, and otherwise
    // sends `message` every `interval`. Both run off a single setInterval. While the Segra
    // window is backgrounded during gameplay, Chromium/WebView2 throttles timers to fire at
    // most about once every 60 seconds. `interval` must stay below that floor so each throttled
    // tick still emits a ping (which the backend answers, resetting the timeout), and `timeout`
    // must stay well above it so one slow tick can't trip the close.
    heartbeat: {
      message: 'ping',
      timeout: 120000,
      interval: 30000,
    },
  });

  const contextValue = {
    sendMessage: useCallback((message: string) => {
      sendMessageToBackend(message);
    }, []),
    isConnected: readyState === ReadyState.OPEN,
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
