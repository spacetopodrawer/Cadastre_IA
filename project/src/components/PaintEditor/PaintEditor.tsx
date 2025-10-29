import { useEffect, useRef, useState } from 'react';
import { Canvas, PencilBrush, Circle, Rect, Line, IText } from 'fabric';
import { Toolbar } from './Toolbar';
import { PropertiesPanel } from './PropertiesPanel';
import { useFileStore } from '../../stores/fileStore';
import { Save, Undo, Redo } from 'lucide-react';

type Tool = 'select' | 'pen' | 'eraser' | 'circle' | 'rectangle' | 'line' | 'text';

export function PaintEditor({ fileId }: { fileId?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [history, setHistory] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [isSaving, setIsSaving] = useState(false);

  const { currentFile, updateFile, saveVersion } = useFileStore();

  useEffect(() => {
    if (!canvasRef.current) return;

    const fabricCanvas = new Canvas(canvasRef.current, {
      width: window.innerWidth - 400,
      height: window.innerHeight - 100,
      backgroundColor: '#ffffff',
    });

    fabricCanvas.isDrawingMode = true;
    fabricCanvas.freeDrawingBrush = new PencilBrush(fabricCanvas);
    fabricCanvas.freeDrawingBrush.color = color;
    fabricCanvas.freeDrawingBrush.width = brushSize;

    setCanvas(fabricCanvas);

    if (currentFile?.content && typeof currentFile.content === 'object' && 'objects' in currentFile.content) {
      fabricCanvas.loadFromJSON(currentFile.content, () => {
        fabricCanvas.renderAll();
      });
    }

    const handleHistory = () => {
      const json = fabricCanvas.toJSON();
      const newHistory = history.slice(0, historyStep + 1);
      newHistory.push(JSON.stringify(json));
      setHistory(newHistory);
      setHistoryStep(newHistory.length - 1);
    };

    fabricCanvas.on('object:added', handleHistory);
    fabricCanvas.on('object:modified', handleHistory);
    fabricCanvas.on('object:removed', handleHistory);

    return () => {
      fabricCanvas.dispose();
    };
  }, []);

  useEffect(() => {
    if (!canvas) return;

    if (currentFile?.content && typeof currentFile.content === 'object' && 'objects' in currentFile.content) {
      canvas.loadFromJSON(currentFile.content, () => {
        canvas.renderAll();
      });
    }
  }, [currentFile, canvas]);

  useEffect(() => {
    if (!canvas) return;

    canvas.freeDrawingBrush.color = color;

    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      activeObject.set('fill', color);
      canvas.renderAll();
    }
  }, [color, canvas]);

  useEffect(() => {
    if (!canvas) return;
    canvas.freeDrawingBrush.width = brushSize;
  }, [brushSize, canvas]);

  useEffect(() => {
    if (!canvas) return;

    switch (tool) {
      case 'select':
        canvas.isDrawingMode = false;
        canvas.selection = true;
        break;
      case 'pen':
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush.color = color;
        break;
      case 'eraser':
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush.color = '#ffffff';
        break;
      default:
        canvas.isDrawingMode = false;
        canvas.selection = false;
    }
  }, [tool, canvas, color]);

  const addShape = (shapeType: 'circle' | 'rectangle' | 'line' | 'text') => {
    if (!canvas) return;

    let shape;
    const centerX = canvas.width! / 2;
    const centerY = canvas.height! / 2;

    switch (shapeType) {
      case 'circle':
        shape = new Circle({
          radius: 50,
          fill: color,
          left: centerX - 50,
          top: centerY - 50,
        });
        break;
      case 'rectangle':
        shape = new Rect({
          width: 100,
          height: 80,
          fill: color,
          left: centerX - 50,
          top: centerY - 40,
        });
        break;
      case 'line':
        shape = new Line([50, 50, 200, 50], {
          stroke: color,
          strokeWidth: brushSize,
          left: centerX - 75,
          top: centerY,
        });
        break;
      case 'text':
        shape = new IText('Texte', {
          left: centerX - 50,
          top: centerY,
          fill: color,
          fontSize: 24,
        });
        break;
    }

    if (shape) {
      canvas.add(shape);
      canvas.setActiveObject(shape);
      canvas.renderAll();
    }
  };

  useEffect(() => {
    if (['circle', 'rectangle', 'line', 'text'].includes(tool)) {
      addShape(tool as 'circle' | 'rectangle' | 'line' | 'text');
      setTool('select');
    }
  }, [tool]);

  const handleSave = async () => {
    if (!canvas || !fileId) return;

    setIsSaving(true);
    try {
      const json = canvas.toJSON();
      const thumbnail = canvas.toDataURL({ format: 'png', quality: 0.3 });

      await updateFile(fileId, {
        content: json,
        thumbnail,
      });

      await saveVersion(fileId, json, 'Sauvegarde manuelle');
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndo = () => {
    if (!canvas || historyStep <= 0) return;
    const prevStep = historyStep - 1;
    canvas.loadFromJSON(JSON.parse(history[prevStep]), () => {
      canvas.renderAll();
      setHistoryStep(prevStep);
    });
  };

  const handleRedo = () => {
    if (!canvas || historyStep >= history.length - 1) return;
    const nextStep = historyStep + 1;
    canvas.loadFromJSON(JSON.parse(history[nextStep]), () => {
      canvas.renderAll();
      setHistoryStep(nextStep);
    });
  };

  const handleClear = () => {
    if (!canvas) return;
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    canvas.renderAll();
  };

  return (
    <div className="flex h-full bg-gray-100">
      <Toolbar tool={tool} onToolChange={setTool} />

      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={historyStep <= 0}
            className="p-2 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="Annuler (Ctrl+Z)"
          >
            <Undo className="w-5 h-5" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyStep >= history.length - 1}
            className="p-2 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="Rétablir (Ctrl+Y)"
          >
            <Redo className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <button
            onClick={handleClear}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Effacer tout
          </button>
          {fileId && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
          <div className="shadow-lg">
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>

      <PropertiesPanel
        color={color}
        brushSize={brushSize}
        onColorChange={setColor}
        onBrushSizeChange={setBrushSize}
      />
    </div>
  );
}
