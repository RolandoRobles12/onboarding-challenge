'use server';

export interface LeaderboardEntry {
  id: string;
  fullName: string;
  assignedKiosk: string;
  score: number;
  totalQuestions: number;
  time: number; // in seconds
  quizType: string;
  avatar: string;
  date: string;
}

// Mock data - in a real app, this would come from a database like Firestore.
// This data will reset on every server restart.
const leaderboardData: LeaderboardEntry[] = [
    { id: '1', fullName: 'Amran Frey', assignedKiosk: 'Ixtapaluca', score: 38, totalQuestions: 40, time: 185, quizType: 'ba', avatar: 'rocket', date: new Date().toISOString() },
    { id: '2', fullName: 'Fil Castro', assignedKiosk: 'Chalco', score: 40, totalQuestions: 40, time: 210, quizType: 'ba', avatar: 'bot', date: new Date().toISOString() },
    { id: '3', fullName: 'Alan Brito', assignedKiosk: 'Valle de Chalco', score: 35, totalQuestions: 40, time: 250, quizType: 'ba', avatar: 'compass', date: new Date().toISOString() },
    { id: '4', fullName: 'Elena Nito', assignedKiosk: 'Ixtapaluca', score: 40, totalQuestions: 40, time: 205, quizType: 'ba', avatar: 'graduation-cap', date: new Date().toISOString() },
    { id: '5', fullName: 'Zacarias Flores', assignedKiosk: 'Chalco', score: 39, totalQuestions: 40, time: 190, quizType: 'ba', avatar: 'rocket', date: new Date().toISOString() },

    { id: '6', fullName: 'Rosa Melcacho', assignedKiosk: 'Neza', score: 56, totalQuestions: 56, time: 320, quizType: 'atn', avatar: 'graduation-cap', date: new Date().toISOString() },
    { id: '7', fullName: 'Armando Casas', assignedKiosk: 'Chimalhuacán', score: 52, totalQuestions: 56, time: 350, quizType: 'atn', avatar: 'bot', date: new Date().toISOString() },
    { id: '8', fullName: 'Aquiles Bailo', assignedKiosk: 'Neza', score: 54, totalQuestions: 56, time: 330, quizType: 'atn', avatar: 'compass', date: new Date().toISOString() },
    { id: '9', fullName: 'Esteban Dido', assignedKiosk: 'Los Reyes', score: 55, totalQuestions: 56, time: 310, quizType: 'atn', avatar: 'rocket', date: new Date().toISOString() },
    { id: '10', fullName: 'Elsa Pato', assignedKiosk: 'Chimalhuacán', score: 56, totalQuestions: 56, time: 295, quizType: 'atn', avatar: 'bot', date: new Date().toISOString() },
];

/**
 * Adds a new entry to the leaderboard.
 * NOTE: This is an in-memory implementation for demonstration. Data will be lost on server restart.
 * @param entry - The leaderboard entry to add.
 */
export async function addLeaderboardEntry(entry: Omit<LeaderboardEntry, 'id' | 'date'>): Promise<void> {
    leaderboardData.push({
        ...entry,
        id: (leaderboardData.length + 1).toString(),
        date: new Date().toISOString(),
    });
}

/**
 * Retrieves the top 5 leaderboard entries for a given quiz type, sorted by score and then time.
 * @param quizType - The type of quiz ('ba' or 'atn').
 * @returns A promise that resolves to an array of the top 5 leaderboard entries.
 */
export async function getLeaderboard(quizType: string): Promise<LeaderboardEntry[]> {
    return leaderboardData
        .filter(entry => entry.quizType === quizType)
        .sort((a, b) => {
            // Sort by score descending
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            // Then by time ascending
            return a.time - b.time;
        })
        .slice(0, 5);
}
