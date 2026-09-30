// Illustrative, browser-only demo. No data is saved, transmitted, or sent to AI.
const demoForm = document.querySelector('#workflow-demo');
if (demoForm) {
  demoForm.addEventListener('submit', event => {
    event.preventDefault();
    const guests = Number(demoForm.elements.guests.value);
    const eventType = demoForm.elements.eventType.value;
    const missing = demoForm.elements.details.value === 'missing';
    const heading = document.querySelector('#demo-status');
    heading.textContent = missing ? 'Needs details before review' : 'Ready for owner review';
    document.querySelector('#demo-summary').textContent = `${eventType} · ${guests} guests · ${missing ? 'dietary details missing' : 'dietary details provided'}`;
    const steps = missing
      ? ['Intake flags the missing dietary information.', 'A follow-up draft asks for dietary needs before the request moves forward.', 'The owner reviews the request and confirms availability.', 'A quote and deposit path are shared only after owner approval.']
      : ['Intake organizes the event type, guest count, and dietary information.', 'The owner receives a summary and reviews availability.', 'A consultation or quote is prepared for owner approval.', 'An approved deposit path and follow-up can be connected to the selected tools.'];
    const list = document.querySelector('#demo-steps');
    list.replaceChildren(...steps.map(step => { const li = document.createElement('li'); li.textContent = step; return li; }));
  });
}
