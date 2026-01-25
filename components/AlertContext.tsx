import React, { createContext, useContext, useState, useCallback } from 'react';

type AlertType = 'info' | 'warning' | 'error' | 'success';

interface Alert {
    id: string;
    message: string;
    type: AlertType;
}

interface AlertContextType {
    showAlert: (message: string, type?: AlertType) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlert = () => {
    const context = useContext(AlertContext);
    if (!context) throw new Error('useAlert must be used within AlertProvider');
    return context;
};

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [alerts, setAlerts] = useState<Alert[]>([]);

    const showAlert = useCallback((message: string, type: AlertType = 'info') => {
        const id = Math.random().toString(36).substr(2, 9);
        setAlerts((prev) => [...prev, { id, message, type }]);

        // Auto remove after 4 seconds
        setTimeout(() => {
            setAlerts((prev) => prev.filter((a) => a.id !== id));
        }, 4000);
    }, []);

    const removeAlert = (id: string) => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
    };

    return (
        <AlertContext.Provider value={{ showAlert }}>
            {children}
            <div className="fixed top-6 right-6 z-[1000] flex flex-col gap-3 pointer-events-none w-full max-w-[400px]">
                {alerts.map((alert) => (
                    <div
                        key={alert.id}
                        className={`
              pointer-events-auto
              w-full p-5 rounded-[2.5rem] shadow-2xl
              backdrop-blur-xl border-2 animate-slideInRight
              flex items-start gap-4 transform transition-all hover:scale-[1.02]
              ${alert.type === 'info' ? 'bg-blue-600/90 border-blue-400/50 text-white shadow-blue-500/20' : ''}
              ${alert.type === 'warning' ? 'bg-amber-500/90 border-amber-300/50 text-white shadow-amber-500/20' : ''}
              ${alert.type === 'error' ? 'bg-red-600/90 border-red-400/50 text-white shadow-red-500/20' : ''}
              ${alert.type === 'success' ? 'bg-emerald-600/90 border-emerald-400/50 text-white shadow-emerald-500/20' : ''}
            `}
                    >
                        <div className="text-2xl mt-1">
                            {alert.type === 'info' && '💎'}
                            {alert.type === 'warning' && '⚠️'}
                            {alert.type === 'error' && '🚫'}
                            {alert.type === 'success' && '✨'}
                        </div>
                        <div className="flex-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-1">{alert.type}</p>
                            <p className="text-sm font-black leading-relaxed tracking-tight">{alert.message}</p>
                        </div>
                        <button
                            onClick={() => removeAlert(alert.id)}
                            className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center hover:bg-black/20 transition-all text-xs"
                        >✕</button>
                    </div>
                ))}
            </div>
        </AlertContext.Provider>
    );
};
