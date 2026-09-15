import { requireAdmin } from './admin-guard.js';
import { getMajors, getCurriculumTree, saveCurriculumTree } from '../../js/firestore.js';

const app = document.querySelector('[data-curriculum-app]');
const majorSelect = document.querySelector('[data-major-select]');
const editor = document.querySelector('[data-editor]');
const treePanel = document.querySelector('[data-tree-panel]');
const filePanel = document.querySelector('[data-file-panel]');
const treeCanvas = document.querySelector('[data-tree-canvas]');
const fileUrl = document.querySelector('[data-file-url]');
const filePreview = document.querySelector('[data-file-preview]');
const notice = document.querySelector('[data-notice]');
const say = (text, type = 'success') => { notice.textContent = text; notice.className = `notice ${type}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

let majors = [];
let current = { mode: 'tree', nodes: [], fileUrl: '' };
let activeMajorId = '';

function renderTree() {
  treeCanvas.innerHTML = current.nodes.length
    ? current.nodes.map((node, i) => `<div class="tree-node" data-depth="${node.depth || 0}"><input data-node-field="label" data-index="${i}" value="${esc(node.label)}" placeholder="Node label"><select data-node-field="depth" data-index="${i}"><option value="0" ${!node.depth ? 'selected' : ''}>Year</option><option value="1" ${node.depth === 1 ? 'selected' : ''}>Semester</option><option value="2" ${node.depth === 2 ? 'selected' : ''}>Subject</option></select><button type="button" class="btn danger icon-btn" data-remove-node="${i}" aria-label="Remove">&times;</button></div>`).join('')
    : '<p style="color:var(--ink-soft);margin:0">No nodes yet — add one to start building the tree.</p>';
}

function renderFilePreview() {
  filePreview.innerHTML = current.fileUrl
    ? (/\.pdf($|\?)/i.test(current.fileUrl)
      ? `<a class="btn secondary" href="${esc(current.fileUrl)}" target="_blank" rel="noopener">Open uploaded PDF</a>`
      : `<img src="${esc(current.fileUrl)}" alt="Curriculum preview">`)
    : '';
}

function setMode(mode) {
  current.mode = mode;
  treePanel.hidden = mode !== 'tree';
  filePanel.hidden = mode !== 'file';
  document.querySelectorAll('[data-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
}

async function loadMajor(id) {
  activeMajorId = id;
  editor.hidden = !id;
  if (!id) return;
  try {
    current = await getCurriculumTree(id);
    if (!current.mode) current.mode = 'tree';
    if (!current.nodes) current.nodes = [];
    setMode(current.mode);
    renderTree();
    fileUrl.value = current.fileUrl || '';
    renderFilePreview();
  } catch (error) {
    say(error.message || 'Could not load this major\u2019s curriculum tree.', 'error');
  }
}

majorSelect.addEventListener('change', () => loadMajor(majorSelect.value));
document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
document.querySelector('[data-add-node]').addEventListener('click', () => { current.nodes.push({ label: '', depth: 0 }); renderTree(); });
treeCanvas.addEventListener('input', event => {
  const index = event.target.dataset.index;
  if (index === undefined) return;
  const field = event.target.dataset.nodeField;
  current.nodes[index][field] = field === 'depth' ? Number(event.target.value) : event.target.value;
  if (field === 'depth') renderTree();
});
treeCanvas.addEventListener('click', event => {
  const index = event.target.dataset.removeNode;
  if (index === undefined) return;
  current.nodes.splice(Number(index), 1);
  renderTree();
});
fileUrl.addEventListener('input', () => { current.fileUrl = fileUrl.value.trim(); renderFilePreview(); });

document.querySelector('[data-save]').addEventListener('click', async () => {
  if (!activeMajorId) return say('Select a major first.', 'error');
  try {
    const payload = current.mode === 'tree'
      ? { mode: 'tree', nodes: current.nodes, fileUrl: '' }
      : { mode: 'file', nodes: [], fileUrl: current.fileUrl || '' };
    const major = majors.find(m => m.id === activeMajorId);
    await saveCurriculumTree(activeMajorId, payload, major?.nameEn || major?.code || activeMajorId);
    say('Curriculum tree saved successfully.');
  } catch (error) {
    say(error.message || 'Could not save the curriculum tree.', 'error');
  }
});

requireAdmin(async () => {
  try {
    majors = await getMajors();
    majorSelect.insertAdjacentHTML('beforeend', majors.map(m => `<option value="${m.id}">${esc(m.nameEn || m.code)}</option>`).join(''));
  } catch (error) {
    say(error.message || 'Could not load majors.', 'error');
  }
  app.hidden = false;
}, 'curriculum');
