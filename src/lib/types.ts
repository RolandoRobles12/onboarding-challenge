export interface Option {
  text: string;
  isCorrect: boolean;
}

export interface Question {
  text: string;
  options: Option[];
}

export interface Mission {
  id: string;
  title: string;
  narrative: string;
  questions: Question[];
}

export interface Quiz {
  title: string;
  missions: Mission[];
}

export type QuizData = {
  [key: string]: Quiz;
};
