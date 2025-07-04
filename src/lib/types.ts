export interface Option {
  text: string;
  isCorrect: boolean;
}

export interface Question {
  text: string;
  options: Option[];
  isTricky?: boolean;
  isMultiSelect?: boolean;
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
