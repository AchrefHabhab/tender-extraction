import { LocaleObject } from "./locale.js";

export enum Priority {
  Must = "must",
  Should = "should",
  Optional = "optional",
}

export enum Confidence {
  High = "high",
  Medium = "medium",
  Low = "low",
}

export enum Fulfillable {
  Yes = "yes",
  No = "no",
  Maybe = "maybe",
}

export enum DeliverableStatus {
  WaitingForAnalysis = "waitingForAnalysis",
  WaitingForAnswer = "waitingForAnswer",
  WaitingForAnswerPropagation = "waitingForAnswerPropagation",
  WaitingForReview = "waitingForReview",
  UserDefined = "userDefined",
}

export enum Feedback {
  Good = "good",
  Bad = "bad",
}

export enum ChatRole {
  System = "system",
  User = "user",
}

export interface ProcurementMatchDeliverable {
  bulletPoint: string;
  description: LocaleObject<string>;
  priority: Priority;
  confidence: Confidence | null;
  equivalenceAllowed: boolean | null;
  fullfillable: Fulfillable | null;
  status: DeliverableStatus;
  aiReasoning: LocaleObject<string> | null;
  feedback: Feedback | null;
  feedbackText: string | null;
  openQuestionId: string | null;
  deliverableArray: ProcurementMatchDeliverable[];
  procurementDocumentChunkIdArray: string[];
  workspaceDocumentChunkIdArray: string[];
  citedProductIdArray: string[];
  citedPersonIdArray: string[];
}
