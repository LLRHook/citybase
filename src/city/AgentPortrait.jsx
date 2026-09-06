export function AgentPortrait({ agent, size = 'normal' }) {
  return <span className={`agent-portrait ${agent.id} ${size}`} style={{ '--agent-color': agent.color }} aria-hidden="true"><i className="portrait-hair"/><i className="portrait-face"><b/><b/></i><i className="portrait-body"/><i className="portrait-strap"/></span>;
}
