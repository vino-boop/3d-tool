
import React from 'react';
import { AppState, PatternType } from '../types';
import { Type, Upload, Download, Sliders } from 'lucide-react';

interface Props {
  config: AppState;
  onChange: (updates: Partial<AppState>) => void;
  onExport: () => void;
}

const UIControls: React.FC<Props> = ({ config, onChange, onExport }) => {
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        onChange({ imageSrc: ev.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const fonts = [
    { name: 'Standard (Inter)', value: 'Inter' },
    { name: 'Bold Headline (Oswald)', value: 'Oswald' },
    { name: 'Elegant (Playfair)', value: 'Playfair Display' },
    { name: 'Monospace (Roboto Mono)', value: 'Roboto Mono' },
    { name: 'System Sans', value: 'Arial' },
    { name: 'System Serif', value: 'Times New Roman' },
  ];

  return (
    <div className="w-full h-full bg-white flex flex-col border-r border-gray-200 overflow-y-auto">
      <div className="p-6 border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <span className="bg-blue-600 text-white p-1 rounded">3D</span> 浮雕生成器
        </h1>
        <p className="text-sm text-gray-500 mt-1">定制您的 3D 打印模型</p>
      </div>

      <div className="flex-1 p-6 space-y-8">
        
        {/* Mode Selection */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">模式选择</h3>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => onChange({ patternType: PatternType.TEXT })}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                config.patternType === PatternType.TEXT
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Type size={16} /> 文字
            </button>
            <button
              onClick={() => onChange({ patternType: PatternType.IMAGE })}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                config.patternType === PatternType.IMAGE
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Upload size={16} /> SVG/图片
            </button>
          </div>
        </section>

        {/* Content Input */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
            {config.patternType === PatternType.TEXT ? '输入内容' : '上传图案'}
          </h3>
          
          {config.patternType === PatternType.TEXT ? (
            <div className="space-y-3">
              <input
                type="text"
                value={config.text}
                onChange={(e) => onChange({ text: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="输入要显示的文字..."
              />
              {/* Font Selection Dropdown */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">选择字体</label>
                <select
                  value={config.fontFamily}
                  onChange={(e) => onChange({ fontFamily: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
                >
                  {fonts.map(f => (
                    <option key={f.value} value={f.value} style={{fontFamily: f.value}}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {config.imageSrc ? (
                    <img src={config.imageSrc} alt="Preview" className="h-20 object-contain" />
                  ) : (
                    <>
                      <Upload className="w-8 h-8 mb-3 text-gray-400" />
                      <p className="text-xs text-gray-500">点击上传 SVG/PNG</p>
                    </>
                  )}
                </div>
                <input type="file" className="hidden" accept="image/*,.svg" onChange={handleFileUpload} />
              </label>
            </div>
          )}
        </section>

        {/* Sliders */}
        <section className="space-y-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider flex items-center gap-2">
            <Sliders size={16} /> 参数调整
          </h3>

          {/* Common Params */}
          <div className="space-y-4">
             {/* Text Size / Image Scale */}
             <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">
                  {config.patternType === PatternType.TEXT ? '字体大小' : '图案缩放'}
                </label>
                <span className="text-xs text-gray-500">
                  {config.patternType === PatternType.TEXT ? config.fontSize : config.imageScale.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={config.patternType === PatternType.TEXT ? 80 : 0.1}
                max={config.patternType === PatternType.TEXT ? 160 : 3}
                step={config.patternType === PatternType.TEXT ? 1 : 0.1}
                value={config.patternType === PatternType.TEXT ? config.fontSize : config.imageScale}
                onChange={(e) => onChange(config.patternType === PatternType.TEXT 
                  ? { fontSize: parseInt(e.target.value) } 
                  : { imageScale: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Letter Spacing (Only for Text) */}
            {config.patternType === PatternType.TEXT && (
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700">文字间距</label>
                  <span className="text-xs text-gray-500">{config.letterSpacing}px</span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="50"
                  step="1"
                  value={config.letterSpacing}
                  onChange={(e) => onChange({ letterSpacing: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            )}

            {/* Emboss Depth - UPDATED MAX TO 0.6 */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">浮雕深度 (凸起)</label>
                <span className="text-xs text-gray-500">{config.embossDepth.toFixed(2)}mm</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.6" 
                step="0.05"
                value={config.embossDepth}
                onChange={(e) => onChange({ embossDepth: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Spacing X */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">水平间距</label>
                <span className="text-xs text-gray-500">{config.spacingX}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={config.spacingX}
                onChange={(e) => onChange({ spacingX: parseInt(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Spacing Y */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">垂直间距</label>
                <span className="text-xs text-gray-500">{config.spacingY}px</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                value={config.spacingY}
                onChange={(e) => onChange({ spacingY: parseInt(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

             {/* Tilt */}
             <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">旋转角度</label>
                <span className="text-xs text-gray-500">{config.tilt}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={config.tilt}
                onChange={(e) => onChange({ tilt: parseInt(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>
        </section>

      </div>

      <div className="p-6 border-t border-gray-200 bg-gray-50">
        <button
          onClick={onExport}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-lg hover:shadow-blue-500/30 active:scale-95"
        >
          <Download size={20} />
          导出 STL 模型
        </button>
        <p className="text-xs text-center text-gray-400 mt-2">适用于所有主流 3D 打印切片软件</p>
      </div>
    </div>
  );
};

export default UIControls;
