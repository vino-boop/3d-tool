
export enum PatternType {
  TEXT = 'text',
  IMAGE = 'image',
}

export interface AppState {
  patternType: PatternType;
  text: string;
  imageSrc: string | null;
  
  // Cylinder Dimensions
  cylinderRadius: number;
  cylinderHeight: number;
  
  // Pattern Properties
  fontSize: number; // For text
  imageScale: number; // For image
  spacingX: number; // Horizontal repetition gap
  spacingY: number; // Vertical repetition gap
  tilt: number; // Rotation in degrees
  embossDepth: number; // How much it sticks out
  
  // Export status
  isGenerating: boolean;
}

export const DEFAULT_STATE: AppState = {
  patternType: PatternType.TEXT,
  text: "VINO's LAB",
  imageSrc: null,
  cylinderRadius: 15, // Radius 15mm
  cylinderHeight: 60,
  fontSize: 120, 
  imageScale: 1,
  spacingX: 20,
  spacingY: 120, // Initial vertical spacing 120
  tilt: 0,
  embossDepth: 0.4, // Depth 0.4mm
  isGenerating: false,
};
