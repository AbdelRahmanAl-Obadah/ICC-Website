import { requireAdmin } from './admin-guard.js';
import { getSettings, updateSettings } from '../../js/firestore.js';

const app = document.querySelector('[data-settings-app]');
const form = document.querySelector('[data-form]');
const notice = document.querySelector('[data-notice]');
const submit = form.querySelector('[type="submit"]');
const say = (message, type = 'success') => { notice.textContent = message; notice.className = `notice ${type}`; };

requireAdmin(async () => {
  try {
    const settings = await getSettings();
    for (const [key, value] of Object.entries(settings)) {
      if (!form.elements[key]) continue;
      if (form.elements[key].type === 'checkbox') form.elements[key].checked = Boolean(value);
      else form.elements[key].value = value ?? '';
    }
    app.hidden = false;
  } catch (error) {
    console.error(error);
    app.hidden = false;
    say(error.message || 'Settings could not be loaded.', 'error');
  }
}, 'settings');

form.addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  submit.textContent = 'Saving…';
  try {
    const data = Object.fromEntries(new FormData(form));
    data.maintenanceMode = form.maintenanceMode.checked;
    await updateSettings(data);
    say('Settings saved successfully.');
  } catch (error) {
    console.error(error);
    say(error.message || 'Could not save settings.', 'error');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Save settings';
  }
});
