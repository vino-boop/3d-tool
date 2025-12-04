import React, { useState, Suspense, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, Center } from '@react-three/drei';
import UIControls from './components/UIControls';
import CylinderObject from './components/CylinderObject';
import { AppState, DEFAULT_STATE } from './types';

const App: React.FC = () => {
  const [config, setConfig] = useState<AppState>(DEFAULT_STATE);
  const [exportFn, setExportFn] = useState<(() => void) | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const handleConfigChange = useCallback((updates: Partial<AppState>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const handleExport = useCallback(() => {
    if (exportFn && !isProcessing) {
      exportFn();
    } else if (isProcessing) {
      alert("Please wait for generation to complete.");
    } else {
      alert("Geometry not ready yet.");
    }
  }, [exportFn, isProcessing]);

  // Callback to receive the export trigger from the child component
  const onSetExportFunction = useCallback((fn: () => void) => {
    setExportFn(() => fn);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left Sidebar: Controls */}
      <div className="w-80 md:w-96 flex-shrink-0 h-full shadow-xl z-10">
        <UIControls 
          config={config} 
          onChange={handleConfigChange} 
          onExport={handleExport}
          isProcessing={isProcessing}
        />
      </div>

      {/* Right Area: 3D Preview */}
      <div className="flex-1 h-full bg-slate-900 relative">
        <div className="absolute top-4 left-4 z-10 bg-black/50 text-white px-3 py-1 rounded-full text-xs backdrop-blur-sm">
          预览模式 (Preview)
        </div>
        
        <Canvas shadows camera={{ position: [0, 0, 100], fov: 45 }}>
          <color attach="background" args={['#0f172a']} />
          <Suspense fallback={null}>
            <Stage environment="city" intensity={0.6}>
              <Center>
                <CylinderObject 
                  config={config} 
                  setExportFunction={onSetExportFunction}
                  onProcessingChange={setIsProcessing}
                />
              </Center>
            </Stage>
            <OrbitControls makeDefault autoRotate={false} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
};

export default App;