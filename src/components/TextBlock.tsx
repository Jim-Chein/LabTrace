import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { upcomingMentions } from "../lib/dates";
import { formatSuggestionWhen } from "../lib/format";
import { useApp } from "../state/store";
import { createId, type Block } from "../types";
import { SuggestionCard } from "./ui";

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
  const ignored = new Set(app.snap.ignored.filter((item) => item.blockId === block.id).map((item) => item.fingerprint));
  const mention = upcomingMentions(block.text.plain, app.now, ignored)[0];
  return (
    <section className="card editor-card" data-block-id={block.id}>
      <div className="card-title-row">
        <h3>实验记录</h3>
        <button className="btn-text" onClick={onDelete}>删除</button>
      </div>
      <EditorContent editor={editor} />
      {mention && (
        <SuggestionCard
          when={formatSuggestionWhen(mention.dueAt)}
          content={mention.content}
          onAdd={() => {
            const ts = Date.now();
            app.saveTodo({
              id: createId(),
              content: mention.content,
              dueAt: mention.dueAt,
              completed: false,
              completedAt: null,
              experimentId: block.experimentId,
              sourceLabel: "实验记录",
              sourceBlockId: block.id,
              sourceStyle: "record",
              tag: "从记录添加",
              notified: false,
              createdAt: ts,
              updatedAt: ts,
            });
            app.ignoreSuggestion(block.experimentId, block.id, mention.fingerprint);
          }}
          onIgnore={() => app.ignoreSuggestion(block.experimentId, block.id, mention.fingerprint)}
        />
      )}
    </section>
  );
}
