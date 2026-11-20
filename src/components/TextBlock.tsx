import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useApp } from "../state/store";
import type { Block } from "../types";

export function TextBlock({ block, onDelete }: { block: Extract<Block, { kind: "text" }>; onDelete: () => void }) {
  const app = useApp();
  const editor = useEditor({
    extensions: [StarterKit],
    content: block.text.html,
    editorProps: { attributes: { class: "tiptap" } },
    onUpdate: ({ editor: current }) => {
      const html = current.getHTML();
      const plain = current.getText();
      if (html === block.text.html && plain === block.text.plain) return;
      app.updateBlock(block.id, (item) => {
        if (item.kind === "text") item.text = { html, plain };
      });
    },
  });
  return (
    <section className="card editor-card" data-block-id={block.id}>
      <div className="card-title-row">
        <h3>实验记录</h3>
        <button className="btn-text" onClick={onDelete}>删除</button>
      </div>
      <EditorContent editor={editor} />
    </section>
  );
}
