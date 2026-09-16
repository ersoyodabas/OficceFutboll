export function createClubBadge(container) {
  container.classList.add('club-badge');
  const initials = document.createElement('span'), img = document.createElement('img');
  img.alt = ''; img.hidden = true; let source = null;
  img.onload = () => { img.hidden = false; };
  img.onerror = () => { img.hidden = true; };
  container.append(initials, img);
  return (club) => {
    initials.textContent = club.shortName;
    container.style.setProperty('--club-color', club.primaryColor);
    container.setAttribute('aria-label', club.name);
    if (source !== club.badge) {
      source = club.badge; img.hidden = true;
      if (source) img.src = new URL('../../assets/' + source, import.meta.url).href;
      else img.removeAttribute('src');
    }
  };
}
