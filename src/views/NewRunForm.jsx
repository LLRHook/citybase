import React from 'react';
import { Panel, Mono, Title, NButton, TextArea, NSelect } from '../game/theme.jsx';

// NewRunForm — the primary action surface when a workspace is open and
// no run is selected. The user types a prompt, picks a provider/model,
// and clicks Run. We submit through citybaseApi.agents.startRun and bubble
// the new runId so App can pivot to RunDetail.
//
// Below the form, when the workspace is dirty, we show a CommitCard so
// the user can commit local changes before or after dispatching a run.
const PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto (prefer Claude)' },
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
];

const MODEL_OPTIONS = [
  { value: '', label: 'Default model' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

export function NewRunForm({
  workspace,
  snapshot,
  onRun,
  onCommit,
  defaultProvider = 'claude',
}) {
  const [prompt, setPrompt] = React.useState('');
  const [provider, setProvider] = React.useState(defaultProvider);
  const [model, setModel] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  const dirtyCount = snapshot?.files?.length || 0;
  const trimmedPrompt = prompt.trim();
  const disabled = submitting || trimmedPrompt.length === 0;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (disabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const run = await onRun({
        provider,
        model: model || undefined,
        promptContext: trimmedPrompt,
      });
      if (run) setPrompt('');
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ flex: 1, padding: 18, overflowY: 'auto' }}>
      <div style={{ maxWidth: 720 }}>
        <Title size={20} weight={700}>Run an agent on {workspace.name}</Title>
        <Mono size={11} color="ink3" style={{ display: 'block', marginTop: 4 }}>
          {workspace.rootPath}
          {snapshot?.branch ? ` · ${snapshot.branch}` : ''}
        </Mono>

        <form onSubmit={submit} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Mono size={9} color="ink3" style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Prompt
            </Mono>
            <TextArea
              value={prompt}
              onChange={setPrompt}
              ariaLabel="Prompt"
              rows={8}
              placeholder="e.g. fix the lint warnings in src/ and write the diff"
            />
          </label>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Mono size={9} color="ink3" style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}>Provider</Mono>
              <NSelect value={provider} onChange={setProvider} options={PROVIDER_OPTIONS} ariaLabel="Provider" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Mono size={9} color="ink3" style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}>Model</Mono>
              <NSelect value={model} onChange={setModel} options={MODEL_OPTIONS} ariaLabel="Model" />
            </label>
            <div style={{ flex: 1 }} />
            <NButton type="submit" accent="green" disabled={disabled} onClick={submit}>
              {submitting ? 'Dispatching…' : '▶ Run'}
            </NButton>
          </div>

          {error && (
            <Mono size={11} color="red" style={{ display: 'block' }}>
              {error}
            </Mono>
          )}
        </form>

        {dirtyCount > 0 && typeof onCommit === 'function' && (
          <div style={{ marginTop: 22 }}>
            <CommitCard dirtyCount={dirtyCount} onCommit={onCommit} />
          </div>
        )}
      </div>
    </div>
  );
}

function CommitCard({ dirtyCount, onCommit }) {
  const [message, setMessage] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const trimmed = message.trim();
  const disabled = submitting || trimmed.length === 0;

  const submit = async () => {
    if (disabled) return;
    setSubmitting(true);
    try {
      const result = await onCommit(trimmed);
      if (result && result.ok) setMessage('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel title="Commit local changes" accent="green" headerRight={
      <Mono size={9} color="green">{dirtyCount} dirty file{dirtyCount === 1 ? '' : 's'}</Mono>
    }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <TextArea
          value={message}
          onChange={setMessage}
          ariaLabel="Commit message"
          rows={3}
          placeholder="commit message"
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <NButton accent="green" disabled={disabled} onClick={submit}>
            {submitting ? 'Committing…' : '✓ Commit'}
          </NButton>
        </div>
      </div>
    </Panel>
  );
}
