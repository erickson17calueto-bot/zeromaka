"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { FinCategoryType } from "@/lib/data";
import { Plus, X, Archive, RotateCcw, Pencil, Check } from "lucide-react";

const pill = (active: boolean) =>
  `rounded-full px-4 py-1.5 text-sm border transition-colors ${active ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-700 text-ink-400 hover:border-ink-500"}`;

export default function CategoriasPage() {
  const { categories, addCategory, editCategory, archiveCategory, reactivateCategory } = useStore();
  const [type, setType] = useState<FinCategoryType>("expense");
  const [showArchived, setShowArchived] = useState(false);

  const parents = useMemo(() =>
    categories
      .filter(c => c.categoryType === type && !c.parentId && (showArchived || c.isActive))
      .sort((a, b) => a.name.localeCompare(b.name, "pt")),
    [categories, type, showArchived]
  );
  const subsOf = (parentId: string) =>
    categories
      .filter(c => c.parentId === parentId && (showArchived || c.isActive))
      .sort((a, b) => a.name.localeCompare(b.name, "pt"));

  // Nova categoria ou subcategoria (mesmo modal — muda o título e a mãe).
  const [newFor, setNewFor] = useState<{ parentId?: string; parentName?: string } | null>(null);
  const [newName, setNewName] = useState("");
  const submitNew = async () => {
    if (!newName.trim()) return;
    const err = await addCategory({ name: newName.trim(), categoryType: type, parentId: newFor?.parentId });
    if (!err) { setNewFor(null); setNewName(""); }
  };

  // Editar nome — inline, um de cada vez.
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const submitEdit = async () => {
    if (!editing || !editing.name.trim()) return;
    const err = await editCategory(editing.id, editing.name.trim());
    if (!err) setEditing(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="font-display text-2xl md:text-3xl tracking-tight">Categorias</h1>
        <p className="text-sm text-ink-400 mt-1">
          Organiza as categorias e subcategorias usadas em lançamentos e faturas. Uma categoria arquivada deixa de
          aparecer em lançamentos novos, mas continua nos que já a usavam.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2">
          <button onClick={() => setType("income")} className={pill(type === "income")}>Entradas</button>
          <button onClick={() => setType("expense")} className={pill(type === "expense")}>Saídas</button>
        </div>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-xs text-ink-400 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Mostrar arquivadas
        </label>
        <button onClick={() => { setNewFor({}); setNewName(""); }} className="btn-primary"><Plus size={15} /> Nova categoria</button>
      </div>

      <div className="card divide-y divide-ink-800">
        {parents.map(p => (
          <div key={p.id} className="p-4">
            <div className="flex items-center gap-2">
              {editing?.id === p.id ? (
                <>
                  <input className="input flex-1" autoFocus value={editing.name}
                    onChange={e => setEditing({ id: p.id, name: e.target.value })}
                    onKeyDown={e => e.key === "Enter" && void submitEdit()} />
                  <button onClick={() => void submitEdit()} className="text-emerald-400 hover:text-emerald-300" title="Guardar"><Check size={16} /></button>
                  <button onClick={() => setEditing(null)} className="text-ink-500 hover:text-ink-100" title="Cancelar"><X size={16} /></button>
                </>
              ) : (
                <>
                  <span className={`flex-1 text-sm font-semibold ${!p.isActive ? "text-ink-500 line-through" : ""}`}>{p.name}</span>
                  {!p.isActive && <span className="text-[10px] rounded-full bg-ink-800 text-ink-400 px-2 py-0.5 shrink-0">arquivada</span>}
                  <button onClick={() => setEditing({ id: p.id, name: p.name })} className="text-ink-500 hover:text-ink-100 shrink-0" title="Editar nome"><Pencil size={14} /></button>
                  <button onClick={() => setNewFor({ parentId: p.id, parentName: p.name })} className="text-ink-500 hover:text-maka-400 shrink-0" title="Nova subcategoria"><Plus size={14} /></button>
                  {p.isActive
                    ? <button onClick={() => void archiveCategory(p.id)} className="text-ink-500 hover:text-red-400 shrink-0" title="Arquivar"><Archive size={14} /></button>
                    : <button onClick={() => void reactivateCategory(p.id)} className="text-ink-500 hover:text-emerald-400 shrink-0" title="Reativar"><RotateCcw size={14} /></button>}
                </>
              )}
            </div>
            {subsOf(p.id).length > 0 && (
              <div className="mt-2.5 ml-4 space-y-2 border-l border-ink-800 pl-3">
                {subsOf(p.id).map(s => (
                  <div key={s.id} className="flex items-center gap-2">
                    {editing?.id === s.id ? (
                      <>
                        <input className="input flex-1 text-sm py-1" autoFocus value={editing.name}
                          onChange={e => setEditing({ id: s.id, name: e.target.value })}
                          onKeyDown={e => e.key === "Enter" && void submitEdit()} />
                        <button onClick={() => void submitEdit()} className="text-emerald-400 hover:text-emerald-300" title="Guardar"><Check size={14} /></button>
                        <button onClick={() => setEditing(null)} className="text-ink-500 hover:text-ink-100" title="Cancelar"><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <span className={`flex-1 text-sm ${!s.isActive ? "text-ink-500 line-through" : "text-ink-300"}`}>{s.name}</span>
                        {!s.isActive && <span className="text-[10px] rounded-full bg-ink-800 text-ink-400 px-2 py-0.5 shrink-0">arquivada</span>}
                        <button onClick={() => setEditing({ id: s.id, name: s.name })} className="text-ink-500 hover:text-ink-100 shrink-0" title="Editar nome"><Pencil size={13} /></button>
                        {s.isActive
                          ? <button onClick={() => void archiveCategory(s.id)} className="text-ink-500 hover:text-red-400 shrink-0" title="Arquivar"><Archive size={13} /></button>
                          : <button onClick={() => void reactivateCategory(s.id)} className="text-ink-500 hover:text-emerald-400 shrink-0" title="Reativar"><RotateCcw size={13} /></button>}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {parents.length === 0 && (
          <div className="p-8 text-center text-sm text-ink-500">
            Sem categorias {type === "income" ? "de entrada" : "de saída"}{showArchived ? "" : " ativas"}.
          </div>
        )}
      </div>

      {newFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg">{newFor.parentId ? "Nova subcategoria" : "Nova categoria"}</h3>
              <button onClick={() => setNewFor(null)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            {newFor.parentName && <p className="text-xs text-ink-500 mb-3">Dentro de {newFor.parentName}</p>}
            <div className="space-y-3">
              <div>
                <label className="label">Nome</label>
                <input className="input" autoFocus value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && void submitNew()} />
              </div>
              <button onClick={() => void submitNew()} disabled={!newName.trim()} className="btn-primary w-full justify-center disabled:opacity-40">Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
