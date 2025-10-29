interface PropertiesPanelProps {
  color: string;
  brushSize: number;
  onColorChange: (color: string) => void;
  onBrushSizeChange: (size: number) => void;
}

export function PropertiesPanel({
  color,
  brushSize,
  onColorChange,
  onBrushSizeChange,
}: PropertiesPanelProps) {
  const presetColors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
    '#FFC0CB', '#A52A2A', '#808080', '#C0C0C0', '#FFD700',
  ];

  return (
    <div className="w-64 bg-white border-l border-gray-200 p-4 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Couleur</h3>
        <div className="space-y-3">
          <div>
            <input
              type="color"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
              className="w-full h-12 rounded border border-gray-300 cursor-pointer"
            />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {presetColors.map((presetColor) => (
              <button
                key={presetColor}
                onClick={() => onColorChange(presetColor)}
                className={`w-10 h-10 rounded border-2 transition-all ${
                  color === presetColor
                    ? 'border-blue-500 scale-110'
                    : 'border-gray-300 hover:scale-105'
                }`}
                style={{ backgroundColor: presetColor }}
                title={presetColor}
              />
            ))}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Taille du pinceau: {brushSize}px
        </h3>
        <input
          type="range"
          min="1"
          max="50"
          value={brushSize}
          onChange={(e) => onBrushSizeChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>1px</span>
          <span>50px</span>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Aperçu</h3>
        <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-center h-24 border border-gray-200">
          <div
            className="rounded-full"
            style={{
              width: `${Math.min(brushSize * 2, 80)}px`,
              height: `${Math.min(brushSize * 2, 80)}px`,
              backgroundColor: color,
            }}
          />
        </div>
      </div>
    </div>
  );
}
