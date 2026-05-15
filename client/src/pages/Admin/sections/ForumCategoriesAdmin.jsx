import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, Globe, Save, X } from 'lucide-react';
import styles from './ForumCategoriesAdmin.module.css';

/**
 * ForumCategoriesAdmin
 *
 * Reddit-style per-category settings: each row is a card preview that mirrors
 * how the category renders on the public forum index (icon + accent strip
 * + name + description + officer-only badge). Click to edit inline; the
 * editor is a single side-panel form so admins see "what the category will
 * look like" alongside the controls that change it.
 *
 * Backend: GET /api/forum/categories (public) + POST/PUT/DELETE
 * /api/forum/categories[/:id] (forum.manage_categories permission).
 */

const QUICK_EMOJI = ['💬', '⚔️', '📋', '🎮', '📢', '🛡️', '🏰', '🐉', '🎲', '🍻', '📜', '🪄'];

function emptyCategory() {
  return {
    id: null,
    name: '',
    description: '',
    icon: '',
    accent_color: '',
    sort_order: 0,
    officer_only: 0,
    age_restricted: 0,
  };
}

export default function ForumCategoriesAdmin({ apiFetch, showToast }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null); // null = nothing open; object = create/edit

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/forum/categories');
      const data = res.ok ? await res.json() : { categories: [] };
      setCategories(Array.isArray(data.categories) ? data.categories : []);
    } catch {
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  function startCreate() {
    setDraft({ ...emptyCategory(), sort_order: (categories.at(-1)?.sort_order || 0) + 10 });
  }

  function startEdit(cat) {
    setDraft({
      id: cat.id,
      name: cat.name || '',
      description: cat.description || '',
      icon: cat.icon || '',
      accent_color: cat.accent_color || '',
      sort_order: cat.sort_order || 0,
      officer_only: cat.officer_only ? 1 : 0,
      age_restricted: cat.age_restricted ? 1 : 0,
    });
  }

  function cancel() { setDraft(null); }

  async function save() {
    if (!draft) return;
    const isEdit = !!draft.id;
    const url = isEdit ? `/forum/categories/${draft.id}` : '/forum/categories';
    const method = isEdit ? 'PUT' : 'POST';
    try {
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          icon: draft.icon || null,
          accent_color: draft.accent_color || null,
          sort_order: draft.sort_order,
          officer_only: !!draft.officer_only,
          age_restricted: !!draft.age_restricted,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Failed to save category');
        return;
      }
      showToast(isEdit ? 'Category updated' : 'Category created');
      setDraft(null);
      load();
    } catch {
      showToast('Failed to save category');
    }
  }

  async function remove(cat) {
    const ok = window.confirm(
      `Delete "${cat.name}"?\n\nThis will permanently remove ${cat.post_count || 0} post${cat.post_count === 1 ? '' : 's'} and all their comments. This cannot be undone.`
    );
    if (!ok) return;
    try {
      const res = await apiFetch(`/forum/categories/${cat.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || 'Failed to delete category'); return; }
      showToast('Category deleted');
      load();
    } catch {
      showToast('Failed to delete category');
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.toolbar}>
        <p className={styles.helper}>
          Each category appears on the forum index. Customise the icon, accent color, and
          visibility per-category &mdash; just like a subreddit.
        </p>
        <button type="button" className="btn btn--primary btn--sm" onClick={startCreate}>
          <Plus size={14} aria-hidden="true" />
          <span>New Category</span>
        </button>
      </div>

      {loading ? (
        <p className={styles.loading}>Loading…</p>
      ) : categories.length === 0 ? (
        <p className={styles.empty}>No categories yet. Click &ldquo;New Category&rdquo; to create the first one.</p>
      ) : (
        <ul className={styles.list}>
          {categories.map((cat) => (
            <li key={cat.id} className={styles.card}>
              <div
                className={styles.accentStrip}
                style={cat.accent_color ? { background: cat.accent_color } : undefined}
              />
              <div className={styles.cardIcon}>{cat.icon || '💬'}</div>
              <div className={styles.cardBody}>
                <div className={styles.cardTitleRow}>
                  <span className={styles.cardName}>{cat.name}</span>
                  {cat.officer_only ? (
                    <span className={styles.badgeOfficer} title="Visible only to officers + guildmaster">
                      <ShieldCheck size={11} aria-hidden="true" />
                      Officer-only
                    </span>
                  ) : (
                    <span className={styles.badgePublic} title="Visible to all members">
                      <Globe size={11} aria-hidden="true" />
                      Public
                    </span>
                  )}
                </div>
                <div className={styles.cardDesc}>{cat.description || <em>No description</em>}</div>
                <div className={styles.cardMeta}>
                  Sort: {cat.sort_order || 0} &middot; {cat.post_count || 0} posts
                </div>
              </div>
              <div className={styles.cardActions}>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => startEdit(cat)}>
                  <Pencil size={13} aria-hidden="true" /><span>Edit</span>
                </button>
                <button type="button" className="btn btn--danger btn--sm" onClick={() => remove(cat)}>
                  <Trash2 size={13} aria-hidden="true" /><span>Delete</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <DraftEditor
          draft={draft}
          setDraft={setDraft}
          save={save}
          cancel={cancel}
          quickEmoji={QUICK_EMOJI}
        />
      )}
    </div>
  );
}

function DraftEditor({ draft, setDraft, save, cancel, quickEmoji }) {
  const isEdit = !!draft.id;
  function field(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  return (
    <div className={styles.modalOverlay} onClick={cancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3>{isEdit ? `Edit "${draft.name || 'category'}"` : 'New category'}</h3>
          <button type="button" className={styles.iconButton} onClick={cancel} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.modalBody}>
          {/* Live preview — mirrors the forum index card so admins see what they're shipping. */}
          <div className={styles.preview}>
            <div className={styles.previewLabel}>Preview</div>
            <div className={styles.previewCard}>
              <div
                className={styles.previewAccent}
                style={draft.accent_color ? { background: draft.accent_color } : undefined}
              />
              <div className={styles.previewIcon}>{draft.icon || '💬'}</div>
              <div className={styles.previewBody}>
                <div className={styles.previewName}>{draft.name || 'Untitled category'}</div>
                <div className={styles.previewDesc}>{draft.description || 'Description appears here.'}</div>
              </div>
            </div>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.formField}>
              <span>Name</span>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => field('name', e.target.value)}
                maxLength={100}
                placeholder="e.g. PvP Strategy"
                autoFocus
              />
            </label>

            <label className={styles.formField}>
              <span>Description</span>
              <input
                type="text"
                value={draft.description}
                onChange={(e) => field('description', e.target.value)}
                maxLength={500}
                placeholder="One-line summary shown under the name"
              />
            </label>

            <label className={styles.formField}>
              <span>Icon (emoji)</span>
              <div className={styles.iconRow}>
                <input
                  type="text"
                  value={draft.icon}
                  onChange={(e) => field('icon', e.target.value)}
                  maxLength={50}
                  placeholder="Paste any emoji"
                  className={styles.iconInput}
                />
                <div className={styles.emojiSwatches}>
                  {quickEmoji.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className={styles.emojiSwatch}
                      onClick={() => field('icon', e)}
                      title={`Use ${e}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </label>

            <label className={styles.formField}>
              <span>Accent color</span>
              <div className={styles.colorRow}>
                <input
                  type="color"
                  value={draft.accent_color || '#b91c1c'}
                  onChange={(e) => field('accent_color', e.target.value)}
                  className={styles.colorPicker}
                  aria-label="Pick accent color"
                />
                <input
                  type="text"
                  value={draft.accent_color}
                  onChange={(e) => field('accent_color', e.target.value)}
                  placeholder="#RRGGBB or blank"
                  maxLength={7}
                  className={styles.colorHex}
                />
                {draft.accent_color && (
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => field('accent_color', '')}
                  >
                    Clear
                  </button>
                )}
              </div>
            </label>

            <label className={styles.formField}>
              <span>Sort order</span>
              <input
                type="number"
                value={draft.sort_order}
                onChange={(e) => field('sort_order', parseInt(e.target.value, 10) || 0)}
                step={10}
              />
            </label>

            <label className={styles.formCheckbox}>
              <input
                type="checkbox"
                checked={!!draft.officer_only}
                onChange={(e) => field('officer_only', e.target.checked ? 1 : 0)}
              />
              <span>Officer-only (hide from non-officers)</span>
            </label>

            <label className={styles.formCheckbox}>
              <input
                type="checkbox"
                checked={!!draft.age_restricted}
                onChange={(e) => field('age_restricted', e.target.checked ? 1 : 0)}
              />
              <span>Age-restricted (show 18+ confirmation modal once per visitor)</span>
            </label>
          </div>
        </div>

        <footer className={styles.modalFooter}>
          <button type="button" className="btn btn--secondary btn--sm" onClick={cancel}>Cancel</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={!draft.name.trim()}>
            <Save size={14} aria-hidden="true" /><span>{isEdit ? 'Save changes' : 'Create category'}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
