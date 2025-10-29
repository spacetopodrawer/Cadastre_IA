import { MousePointer2, Pencil, Eraser, Circle, Square, Minus, Type } from 'lucide-react';

type Tool = 'select' | 'pen' | 'eraser' | 'circle' | 'rectangle' | 'line' | 'text';

interface ToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
}

export function Toolbar({ tool, onToolChange }: ToolbarProps) {
  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Sélection' },
    { id: 'pen', icon: Pencil, label: 'Crayon' },
    { id: 'eraser', icon: Eraser, label: 'Gomme' },
    { id: 'circle', icon: Circle, label: 'Cercle' },
    { id: 'rectangle', icon: Square, label: 'Rectangle' },
    { id: 'line', icon: Minus, label: 'Ligne' },
    { id: 'text', icon: Type, label: 'Texte' },
  ] as const;

  return (
    <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-2">
      {tools.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onToolChange(id as Tool)}
          className={`w-12 h-12 flex items-center justify-center rounded-lg transition-colors ${
            tool === id
              ? 'bg-blue-600 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          title={label}
        >
          <Icon className="w-5 h-5" />
        </button>
      ))}
    </div>
  );
}
