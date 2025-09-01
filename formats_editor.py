#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Editor simple para static/formats.status.json

✅ Funciones clave
- Cargar el JSON y mostrarlo en una tabla (id, enabled)
- Agregar, editar y borrar formatos
- Alternar enabled con doble‑clic o botón
- Buscar/filtrar por id
- Habilitar/Deshabilitar múltiples seleccionados
- Guardar con respaldo automático (archivo .bak con timestamp)
- Validación básica (ids únicos, no vacíos)
- Atajos: Ctrl+S (guardar), Supr (borrar), Insert (agregar), F2 (editar)

Dependencias: solo Python estándar (tkinter, json)

Uso:
  python formats_editor.py [ruta_al_json]
  # Por defecto: static/formats.status.json
"""
from __future__ import annotations
import json
import sys
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog, filedialog
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass

DEFAULT_PATH = Path("static") / "formats.status.json"

@dataclass
class FormatRow:
    id: str
    enabled: bool

class FormatsModel:
    def __init__(self, json_path: Path):
        self.json_path = json_path
        self.rows: list[FormatRow] = []
        self._original = ""

    def load(self):
        if not self.json_path.exists():
            # Si no existe, inicializamos un esqueleto
            data = {"version": 1, "status": []}
            self._original = json.dumps(data, ensure_ascii=False, indent=2)
            self.rows = []
            return
        text = self.json_path.read_text(encoding="utf-8")
        self._original = text
        data = json.loads(text)
        status = data.get("status", [])
        self.rows = [FormatRow(x.get("id", ""), bool(x.get("enabled", False))) for x in status]

    def to_json_text(self) -> str:
        data = {
            "version": 1,
            "status": [{"id": r.id, "enabled": r.enabled} for r in self.rows]
        }
        return json.dumps(data, ensure_ascii=False, indent=2) + "\n"

    def backup(self, suffix: str | None = None) -> Path:
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        suf = f".{suffix}" if suffix else ""
        bak = self.json_path.with_suffix(self.json_path.suffix + f".{ts}{suf}.bak")
        bak.parent.mkdir(parents=True, exist_ok=True)
        text = self._original if self._original else self.to_json_text()
        bak.write_text(text, encoding="utf-8")
        return bak

    def save(self):
        self.json_path.parent.mkdir(parents=True, exist_ok=True)
        out = self.to_json_text()
        # Hacemos un backup antes de sobreescribir si cambió
        if self._original != out and self.json_path.exists():
            self.backup("pre")
        self.json_path.write_text(out, encoding="utf-8")
        self._original = out

    def ensure_unique_id(self, new_id: str, ignore: str | None = None) -> bool:
        for r in self.rows:
            if r.id == new_id and r.id != ignore:
                return False
        return True

class FormatsEditor(ttk.Frame):
    def __init__(self, master, model: FormatsModel):
        super().__init__(master)
        self.model = model
        self.filtered_ids: set[str] | None = None
        self.pack(fill=tk.BOTH, expand=True)
        self._build_ui()
        self._load_into_view()

    # UI
    def _build_ui(self):
        self.master.title("Formats Status Editor")
        self.master.geometry("720x520")
        self.master.minsize(560, 360)

        # Top bar
        top = ttk.Frame(self)
        top.pack(side=tk.TOP, fill=tk.X, padx=8, pady=(8,4))

        self.search_var = tk.StringVar()
        search = ttk.Entry(top, textvariable=self.search_var)
        search.pack(side=tk.LEFT, fill=tk.X, expand=True)
        search.insert(0, "Buscar por id…")
        search.bind("<FocusIn>", lambda e: self._clear_placeholder())
        search.bind("<KeyRelease>", lambda e: self._apply_filter())

        ttk.Button(top, text="Agregar", command=self._add).pack(side=tk.LEFT, padx=(8,0))
        ttk.Button(top, text="Editar", command=self._edit_selected).pack(side=tk.LEFT, padx=(4,0))
        ttk.Button(top, text="Borrar", command=self._delete_selected).pack(side=tk.LEFT, padx=(4,0))

        # Toggle group
        grp = ttk.Frame(self)
        grp.pack(side=tk.TOP, fill=tk.X, padx=8, pady=4)
        ttk.Button(grp, text="Habilitar", command=lambda: self._bulk_enable(True)).pack(side=tk.LEFT)
        ttk.Button(grp, text="Deshabilitar", command=lambda: self._bulk_enable(False)).pack(side=tk.LEFT, padx=(4,0))
        ttk.Button(grp, text="Invertir selección", command=self._invert_selected).pack(side=tk.LEFT, padx=(4,0))

        # Tree
        self.tree = ttk.Treeview(self, columns=("id","enabled"), show="headings", selectmode="extended")
        self.tree.heading("id", text="id")
        self.tree.heading("enabled", text="enabled")
        self.tree.column("id", width=440, anchor=tk.W)
        self.tree.column("enabled", width=100, anchor=tk.CENTER)
        self.tree.pack(side=tk.TOP, fill=tk.BOTH, expand=True, padx=8, pady=4)
        self.tree.bind("<Double-1>", self._on_double_click)

        # Bottom bar
        bottom = ttk.Frame(self)
        bottom.pack(side=tk.BOTTOM, fill=tk.X, padx=8, pady=8)
        ttk.Button(bottom, text="Abrir…", command=self._open_other).pack(side=tk.LEFT)
        ttk.Button(bottom, text="Guardar (Ctrl+S)", command=self._save).pack(side=tk.LEFT, padx=(6,0))
        ttk.Button(bottom, text="Guardar como…", command=self._save_as).pack(side=tk.LEFT, padx=(6,0))
        ttk.Button(bottom, text="Backup ahora", command=self._backup_now).pack(side=tk.LEFT, padx=(6,0))
        self.status = ttk.Label(bottom, text="Listo")
        self.status.pack(side=tk.RIGHT)

        # Menú y atajos
        menubar = tk.Menu(self.master)
        filem = tk.Menu(menubar, tearoff=0)
        filem.add_command(label="Abrir…", command=self._open_other)
        filem.add_command(label="Guardar", command=self._save, accelerator="Ctrl+S")
        filem.add_command(label="Guardar como…", command=self._save_as)
        filem.add_separator()
        filem.add_command(label="Salir", command=self.master.destroy)
        menubar.add_cascade(label="Archivo", menu=filem)
        self.master.config(menu=menubar)

        self.master.bind("<Control-s>", lambda e: self._save())
        self.master.bind("<Delete>", lambda e: self._delete_selected())
        self.master.bind("<Insert>", lambda e: self._add())
        self.master.bind("<F2>", lambda e: self._edit_selected())

        # Estilos mínimos amigables
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("Treeview", rowheight=26)

    def _clear_placeholder(self):
        if self.search_var.get() == "Buscar por id…":
            self.search_var.set("")

    # Data <-> Tree
    def _load_into_view(self):
        self.tree.delete(*self.tree.get_children())
        for r in self.model.rows:
            if self.filtered_ids is not None and r.id not in self.filtered_ids:
                continue
            self.tree.insert("", tk.END, values=(r.id, "✅" if r.enabled else "❌"))
        self._set_status()

    def _current_selection_rows(self) -> list[FormatRow]:
        ids = []
        for item in self.tree.selection():
            row_id, enabled_icon = self.tree.item(item, "values")
            ids.append(row_id)
        return [r for r in self.model.rows if r.id in ids]

    def _find_row(self, row_id: str) -> FormatRow | None:
        for r in self.model.rows:
            if r.id == row_id:
                return r
        return None

    # Actions
    def _add(self):
        dlg = RowDialog(self.master, title="Agregar formato")
        if dlg.result is None:
            return
        new_id, enabled = dlg.result
        new_id = new_id.strip()
        if not new_id:
            messagebox.showerror("Error", "El id no puede estar vacío.")
            return
        if not self.model.ensure_unique_id(new_id):
            messagebox.showerror("Error", f"El id '{new_id}' ya existe.")
            return
        self.model.rows.append(FormatRow(new_id, enabled))
        self._load_into_view()

    def _edit_selected(self):
        items = self.tree.selection()
        if not items:
            messagebox.showinfo("Editar", "Seleccioná un registro para editar.")
            return
        if len(items) > 1:
            messagebox.showinfo("Editar", "Editá de a uno por vez.")
            return
        row_id, enabled_icon = self.tree.item(items[0], "values")
        row = self._find_row(row_id)
        if not row:
            return
        dlg = RowDialog(self.master, title="Editar formato", init_id=row.id, init_enabled=row.enabled)
        if dlg.result is None:
            return
        new_id, enabled = dlg.result
        new_id = new_id.strip()
        if not new_id:
            messagebox.showerror("Error", "El id no puede estar vacío.")
            return
        if not self.model.ensure_unique_id(new_id, ignore=row.id):
            messagebox.showerror("Error", f"El id '{new_id}' ya existe.")
            return
        row.id = new_id
        row.enabled = enabled
        self._load_into_view()

    def _delete_selected(self):
        rows = self._current_selection_rows()
        if not rows:
            return
        if not messagebox.askyesno("Confirmar", f"¿Borrar {len(rows)} registro(s)?"):
            return
        keep = [r for r in self.model.rows if r not in rows]
        self.model.rows = keep
        self._load_into_view()

    def _bulk_enable(self, enabled: bool):
        rows = self._current_selection_rows()
        if not rows:
            return
        for r in rows:
            r.enabled = enabled
        self._load_into_view()

    def _invert_selected(self):
        rows = self._current_selection_rows()
        if not rows:
            return
        for r in rows:
            r.enabled = not r.enabled
        self._load_into_view()

    def _on_double_click(self, event):
        item = self.tree.identify_row(event.y)
        if not item:
            return
        row_id, enabled_icon = self.tree.item(item, "values")
        row = self._find_row(row_id)
        if row:
            row.enabled = not row.enabled
            self._load_into_view()

    def _save(self):
        try:
            self.model.save()
            self._set_status("Guardado ✔")
        except Exception as e:
            messagebox.showerror("Error al guardar", str(e))

    def _save_as(self):
        path = filedialog.asksaveasfilename(title="Guardar como…", defaultextension=".json", filetypes=[("JSON","*.json"), ("Todos","*.*")])
        if not path:
            return
        self.model.json_path = Path(path)
        self._save()

    def _backup_now(self):
        try:
            p = self.model.backup()
            self._set_status(f"Backup: {p.name}")
            messagebox.showinfo("Backup", f"Respaldo creado:\n{p}")
        except Exception as e:
            messagebox.showerror("Error de backup", str(e))

    def _open_other(self):
        path = filedialog.askopenfilename(title="Abrir JSON", filetypes=[("JSON","*.json"), ("Todos","*.*")])
        if not path:
            return
        self.model.json_path = Path(path)
        try:
            self.model.load()
            self.filtered_ids = None
            self.search_var.set("")
            self._load_into_view()
            self._set_status(f"Abierto: {Path(path).name}")
        except Exception as e:
            messagebox.showerror("Error al abrir", str(e))

    def _apply_filter(self):
        q = self.search_var.get().strip()
        if not q or q == "Buscar por id…":
            self.filtered_ids = None
            self._load_into_view()
            return
        ql = q.lower()
        ids = {r.id for r in self.model.rows if ql in r.id.lower()}
        self.filtered_ids = ids
        self._load_into_view()

    def _set_status(self, text: str | None = None):
        if text is None:
            text = f"Registros: {len(self.model.rows)} | Archivo: {self.model.json_path}"
        self.status.config(text=text)

class RowDialog(simpledialog.Dialog):
    def __init__(self, parent, title: str, init_id: str = "", init_enabled: bool = True):
        self._init_id = init_id
        self._init_enabled = init_enabled
        self.result: tuple[str,bool] | None = None
        super().__init__(parent, title)

    def body(self, master):
        ttk.Label(master, text="id:").grid(row=0, column=0, sticky=tk.W, padx=6, pady=6)
        self.var_id = tk.StringVar(value=self._init_id)
        entry = ttk.Entry(master, textvariable=self.var_id, width=42)
        entry.grid(row=0, column=1, padx=6, pady=6)
        entry.focus_set()

        self.var_enabled = tk.BooleanVar(value=self._init_enabled)
        chk = ttk.Checkbutton(master, text="enabled", variable=self.var_enabled)
        chk.grid(row=1, column=1, sticky=tk.W, padx=6, pady=6)
        return entry

    def validate(self):
        vid = self.var_id.get().strip()
        if not vid:
            messagebox.showerror("Error", "El id no puede estar vacío.")
            return False
        return True

    def apply(self):
        self.result = (self.var_id.get().strip(), bool(self.var_enabled.get()))


def main():
    json_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    root = tk.Tk()
    model = FormatsModel(json_path)
    try:
        model.load()
    except Exception as e:
        messagebox.showerror("Error al cargar JSON", str(e))
    app = FormatsEditor(root, model)
    root.mainloop()

if __name__ == "__main__":
    main()
