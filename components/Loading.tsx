
import React from 'react';

interface LoadingProps {
    message?: string;
    color?: string;
}

const Loading: React.FC<LoadingProps> = ({ message = 'Sincronizando dados...', color = '#006B47' }) => {
    return (
        <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
            <div
                className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: `${color} transparent transparent ${color}`, borderTopColor: 'transparent' }}
            ></div>
            <p
                className="text-[10px] font-black uppercase tracking-[0.3em] animate-pulse"
                style={{ color }}
            >
                {message}
            </p>
        </div>
    );
};

export default Loading;
