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
                            w-full p-6 rounded-[2rem] shadow-2xl
                            backdrop-blur-2xl border-2 animate-slideInRight
                            flex items-center gap-5 transform transition-all hover:scale-[1.02]
                            ${alert.type === 'info' ? 'bg-blue-600/90 border-blue-400/50 text-white shadow-blue-500/30' : ''}
                            ${alert.type === 'warning' ? 'bg-amber-500/90 border-amber-300/50 text-white shadow-amber-500/30 animate-shake' : ''}
                            ${alert.type === 'error' ? 'bg-rose-600/90 border-rose-400/50 text-white shadow-rose-600/30 animate-shake' : ''}
                            ${alert.type === 'success' ? 'bg-emerald-600/90 border-emerald-400/50 text-white shadow-emerald-600/30' : ''}
                        `}
                    >
                        <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                            {alert.type === 'info' && '💎'}
                            {alert.type === 'warning' && '⚠️'}
                            {alert.type === 'error' && '🚫'}
                            {alert.type === 'success' && '✨'}
                        </div>
                        <div className="flex-1">
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-70 mb-1">{alert.type}</p>
                            <p className="text-sm font-black leading-tight tracking-tight">{alert.message}</p>
                        </div>
                        <button
                            onClick={() => removeAlert(alert.id)}
                            className="w-10 h-10 rounded-xl bg-black/10 flex items-center justify-center hover:bg-black/20 transition-all text-sm font-bold"
                        >✕</button>
                    </div>
                ))}
            </div>
        </AlertContext.Provider>
    );
};
