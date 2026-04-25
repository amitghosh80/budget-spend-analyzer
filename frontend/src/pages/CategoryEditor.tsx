import { useEffect, useState, useRef } from "react";
import {
  getCategories,
  CategoryDefinition,
  updateCategory,
  recategorizeAll,
} from "../api/expenseApi";

type Props = { onBack: () => void };

const CategoryEditor = ({ onBack }: Props) => {
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [saving, setSaving] = useState<string | null>(null); // slug being saved
  const [recatResult, setRecatResult] = useState<number | null>(null);
  const [recatLoading, setRecatLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCategories()
      .then((cats) => setCategories(cats.filter((c) => c.slug !== "uncategorized")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (editSlug && inputRef.current) inputRef.current.focus();
  }, [editSlug]);

  const startEdit = (slug: string) => {
    setEditSlug(slug);
    setNewKeyword("");
    setRecatResult(null);
  };

  const cancelEdit = () => {
    setEditSlug(null);
    setNewKeyword("");
  };

  const handleAddKeyword = (slug: string) => {
    const kw = newKeyword.trim().toUpperCase();
    if (!kw) return;
    setCategories((cats) =>
      cats.map((c) =>
        c.slug === slug && !c.keywords.includes(kw)
          ? { ...c, keywords: [...c.keywords, kw] }
          : c
      )
    );
    setNewKeyword("");
    inputRef.current?.focus();
  };

  const handleRemoveKeyword = (slug: string, kw: string) => {
    setCategories((cats) =>
      cats.map((c) =>
        c.slug === slug ? { ...c, keywords: c.keywords.filter((k) => k !== kw) } : c
      )
    );
  };

  const handleSave = async (slug: string) => {
    const cat = categories.find((c) => c.slug === slug);
    if (!cat) return;
    setSaving(slug);
    try {
      await updateCategory(cat);
      setEditSlug(null);
    } catch {
      /* ignore */
    } finally {
      setSaving(null);
    }
  };

  const handleRecategorize = async () => {
    setRecatLoading(true);
    setRecatResult(null);
    try {
      const result = await recategorizeAll();
      setRecatResult(result.recategorized);
    } catch {
      /* ignore */
    } finally {
      setRecatLoading(false);
    }
  };

  const fixed = categories.filter((c) => c.type === "fixed");
  const variable = categories.filter((c) => c.type === "variable");

  if (loading) {
    return (
      <div className="step-card fade-in">
        <p style={{ textAlign: "center", color: "#94a3b8", padding: "40px 0" }}>
          Loading categories…
        </p>
      </div>
    );
  }

  const renderCategory = (cat: CategoryDefinition) => {
    const isEditing = editSlug === cat.slug;
    const isSaving = saving === cat.slug;
    return (
      <div key={cat.slug} className={`ce-cat ${isEditing ? "ce-cat--editing" : ""}`}>
        <div className="ce-cat__header">
          <span className="ce-cat__name">{cat.name}</span>
          <span className={`ce-cat__badge ce-cat__badge--${cat.type}`}>
            {cat.type === "fixed" ? "Fixed" : "Variable"}
          </span>
          {!isEditing && (
            <button
              className="ce-cat__edit-btn"
              onClick={() => startEdit(cat.slug)}
              type="button"
            >
              Edit
            </button>
          )}
        </div>

        <div className="ce-cat__keywords">
          {cat.keywords.length === 0 && !isEditing && (
            <span className="ce-keyword ce-keyword--empty">no keywords</span>
          )}
          {cat.keywords.map((kw) => (
            <span key={kw} className="ce-keyword">
              <span className="ce-keyword__text">{kw}</span>
              {isEditing && (
                <button
                  className="ce-keyword__remove"
                  onClick={() => handleRemoveKeyword(cat.slug, kw)}
                  type="button"
                  title="Remove keyword"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>

        {isEditing && (
          <div className="ce-add-row">
            <input
              ref={inputRef}
              className="ce-add-input"
              placeholder="Add keyword (e.g. STARBUCKS)"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddKeyword(cat.slug);
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <button
              className="btn btn--sm"
              onClick={() => handleAddKeyword(cat.slug)}
              type="button"
              disabled={!newKeyword.trim()}
            >
              Add
            </button>
          </div>
        )}

        {isEditing && (
          <div className="ce-cat__actions">
            <button
              className="btn btn--primary btn--sm"
              onClick={() => handleSave(cat.slug)}
              type="button"
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button
              className="btn btn--outline btn--sm"
              onClick={cancelEdit}
              type="button"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="step-card fade-in">
      <button className="back-btn" onClick={onBack} type="button">← Back</button>
      <div className="step-icon">✎</div>
      <h2>Category Rules</h2>
      <p className="step-desc">
        Edit the keywords used to auto-categorize transactions. Changes take effect
        when you click "Re-run Categorization".
      </p>

      <div className="ce-recat-bar">
        <button
          className="btn btn--primary"
          onClick={handleRecategorize}
          type="button"
          disabled={recatLoading}
        >
          {recatLoading ? "Running…" : "Re-run Categorization"}
        </button>
        {recatResult !== null && (
          <span className="ce-recat-result">
            ✓ {recatResult.toLocaleString()} transaction{recatResult !== 1 ? "s" : ""} re-categorized
          </span>
        )}
      </div>

      <div className="ce-section">
        <h3 className="ce-section-title ce-section-title--fixed">Fixed Costs</h3>
        <div className="ce-cats">{fixed.map(renderCategory)}</div>
      </div>

      <div className="ce-section">
        <h3 className="ce-section-title ce-section-title--variable">Variable Costs</h3>
        <div className="ce-cats">{variable.map(renderCategory)}</div>
      </div>
    </div>
  );
};

export default CategoryEditor;
