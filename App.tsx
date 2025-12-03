import React, { useState, Suspense, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, Center } from '@react-three/drei';
import UIControls from './components/UIControls';
import CylinderObject from './components/CylinderObject';
import { AppState, DEFAULT_STATE } from './types';

const App: React.FC = () => {
  const [config, setConfig] = useState<AppState>(DEFAULT_STATE);
  const [exportFn, setExportFn] = useState<(() => void) | null>(null);

  const handleConfigChange = useCallback((updates: Partial<AppState>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const handleExport = useCallback(() => {
    if (exportFn) {
      exportFn();
    } else {
      alert("Geometry not ready yet.");
    }
  }, [exportFn]);

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
                />
              </Center>
            </Stage>
            {/* 
              OrbitControls:
              enableRotate={true} allows manual rotation.
              autoRotate={false} keeps it fixed as requested by "preview window do not rotate... fixed cylinder" 
              (Interpreting "don't rotate" as "don't auto-spin", but allow user inspection)
            */}
            <OrbitControls makeDefault autoRotate={false} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
};

export default App;