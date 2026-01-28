/**
 * Utilitários para padronização de datas e horas no fuso horário America/Sao_Paulo (UTC-3).
 */

const TIMEZONE = 'America/Sao_Paulo';

/**
 * Retorna a data atual formatada como YYYY-MM-DD no fuso horário de Brasília.
 */
export const getLocalDateISO = (date: Date = new Date()): string => {
    return new Intl.DateTimeFormat('fr-CA', { timeZone: TIMEZONE }).format(date);
};

/**
 * Retorna a hora atual formatada como HH:mm:ss no fuso horário de Brasília.
 */
export const getLocalTimeString = (date: Date | string = new Date()): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(dateObj);
};

/**
 * Retorna a data formatada como DD/MM/YYYY no fuso horário de Brasília.
 */
export const getLocalDateString = (date: Date | string = new Date()): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIMEZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(dateObj);
};

/**
 * Retorna a data e hora completa no fuso horário de Brasília.
 */
export const getLocalDateTimeString = (date: Date | string = new Date()): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIMEZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(dateObj);
};

/**
 * Converte uma data (string ISO ou Objeto) para o fuso horário local e retorna o objeto Date.
 * Útil para cálculos que dependem da hora local.
 */
export const toLocaleDate = (date: string | Date): Date => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Date(dateObj.toLocaleString('en-US', { timeZone: TIMEZONE }));
};
/**
 * Retorna o primeiro e último dia do mês atual formatados como YYYY-MM-DD.
 */
export const getLocalMonthRange = (): { start: string, end: string } => {
    const now = toLocaleDate(new Date());
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
        start: getLocalDateISO(firstDay),
        end: getLocalDateISO(lastDay)
    };
};
