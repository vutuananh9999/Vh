
export type ExtractionCategory = 'characters' | 'world' | 'mechanics' | 'dna';

export interface WritingDNA {
  narrativeVoice: string; 
  vocabularyPalette: string[]; 
  sentenceStructure: string; 
  thematicElements: string[]; 
  emotionalTone: string;
  rhythm: string; // Nhịp điệu văn chương
}

export interface KnowledgeLog {
  id: string;
  timestamp: number;
  category: ExtractionCategory;
  title: string;
  content: string;
  isActive: boolean;
  embedding?: number[];
  sourceChapterId?: string;
}

export interface WebInspiration {
  title: string;
  snippet: string;
  url: string;
  sourceType: 'literature' | 'history' | 'writing_tip' | 'general';
}

export interface VocabularyInsight {
  word: string;
  count: number;
  suggestions: string[];
  context: string;
}

export interface DocumentAnalysis {
  summary: string;
  characterAnalysis: string;
  styleAnalysis: string;
  pacingAnalysis: string;
  writingDNA?: WritingDNA;
}

export interface ReferenceDocument {
  id: string;
  name: string;
  content: string;
  analysis: DocumentAnalysis;
  createdAt: number;
}

export interface EvolutionLog {
  id: string;
  timestamp: number;
  type: 'positive' | 'negative' | 'derived_rule';
  context: string;
  userEdit?: string;
  learnedRule: string;
  isActive: boolean;
}

export interface VectorData {
  id: string;
  storyId: string;
  text: string;
  embedding: number[];
  magnitude?: number;
  createdAt: number;
  metadata: {
    type: 'chapter' | 'character' | 'lore' | 'summary' | 'reference';
    referenceId: string;
    characterIds?: string[];
    chapterIndex?: number;
    importance?: number;
  };
}

export type CharacterStatus = 'alive' | 'injured' | 'critical' | 'missing' | 'deceased' | 'sealed';
export type EntityType = 'human' | 'creature' | 'spirit' | 'object';

export interface Character {
  id: string;
  name: string;
  entityType?: EntityType; // New: human, creature (dragon/mount), spirit, object
  species?: string; // New: Human, Dragon, Elf, Sword Spirit...
  description: string;
  role: string;
  status: CharacterStatus; 
  traits: string[];
  appearance: string;
  avatarUrl?: string;
  currentLocation?: string; 
  healthStatus?: string; 
  powerLevel?: string;
  abilities?: string; 
  mentors?: string; 
  enemies?: string; 
  knowledge?: string;
  combatState?: string;
  embedding?: number[];
}

export interface PinnedMemory {
  physical: string[]; 
  emotional: string[]; 
  relational: string[]; 
  world: string[]; 
  inventory: string[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  summary: string; 
  outline: string; 
  timeSetting?: string;
  order: number;
  wordGoal?: number;
  lastUpdated: number;
  videoUrl?: string;
}

export interface Story {
  id: string;
  title: string;
  synopsis?: string;
  genre: string;
  planning: string; 
  persistentDirectives?: string; 
  setting: string; 
  currentTimeline?: string;
  mechanics?: string; 
  interactionRules?: string; 
  logistics?: string;
  trade?: string;
  economy?: string;
  maps?: string;
  officials?: string;
  writingStyle?: string; 
  pov: string; 
  pronounStyle: string; 
  negativePrompt?: string; 
  nsfw?: boolean;
  hasSystem?: boolean; // System/LitRPG toggle
  isFanfiction?: boolean; // New: Fanfiction mode
  fandomName?: string; // New: Original work name (e.g., Harry Potter)
  referenceDocs: ReferenceDocument[];
  evolutionLogs?: EvolutionLog[];
  knowledgeLogs?: KnowledgeLog[];
  writingDNA?: WritingDNA; 
  styleReference?: string;
  pinnedMemory?: PinnedMemory;
  planningChatHistory?: ChatMessage[];
  plotChatHistory?: ChatMessage[];
  characters: Character[];
  createdAt: number;
  chapters: Chapter[];
}

export interface BackupData {
  version: number;
  story: Story;
  vectors: VectorData[];
  exportedAt: number;
}
