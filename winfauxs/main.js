const WINDOW_BORDERS_BEFORE = ['nw', 'n', 'ne', 'w'];
const WINDOW_BORDERS_AFTER = ['e', 'sw', 's', 'se'];

let windows = [];
let desktopIcons = [];
let activeWindow;
let activeIcon;

class ViewBorder {
  constructor(viewWindow, parentElement) {
    this.viewWindow = viewWindow;
    this.parentElement = parentElement;
    this.setUp();
  }

  setUp() {
    this.borderElements = [];
    const addBorderElement = (element, border) => {
      element.addEventListener('mousedown', (event) => {
        this.viewWindow.setAsActive();
        this.viewWindow.startResize(event.clientX, event.clientY, event.buttons, [...border]);
        document.getElementsByTagName('body')[0].style.cursor = `${border}-resize`;
      });
      this.borderElements.push(element);
    };
    const contentElement = this.parentElement.querySelector('.view-window-inner');
    WINDOW_BORDERS_BEFORE.forEach((border) => {
      const element = document.createElement('div');
      element.className = `view-window-border-${border}`;
      this.parentElement.insertBefore(element, contentElement);
      addBorderElement(element, border);
    });
    WINDOW_BORDERS_AFTER.forEach((border) => {
      const element = document.createElement('div');
      element.className = `view-window-border-${border}`;
      this.parentElement.appendChild(element);
      addBorderElement(element, border);
    });
  }

  setVisibility(visible) {
    this.borderElements.forEach((element) => {
      element.style.visibility = visible ? 'visible' : 'hidden';
    });
  }
}

class ViewWindow {
  constructor(id, startOpened = true) {
    this.id = id;
    this.dragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.resizingLeft = false;
    this.resizingRight = false;
    this.resizingTop = false;
    this.resizingBottom = false;
    this.anchorX = 0;
    this.anchorY = 0;
    this.maximized = false;
    this.setUp(startOpened);
  }

  setUp(startOpened = true) {
    this.element = document.getElementById(this.id);
    this.titleElement = this.element.querySelector('.view-window-title');
    this.contentElement = this.element.querySelector('.view-window-content');

    const style = window.getComputedStyle(this.element);
    this.iconUrl = style.getPropertyValue('--icon');
    this.title = style.getPropertyValue('--title').trim().replaceAll("\"", "");
    this.titleElement.querySelector('.view-window-title-text').innerHTML = this.title;

    this.viewBorder = new ViewBorder(this, this.element);

    this.createEvents();
    if (startOpened) {
      this.show(/*opened=*/true);
    } else {
      this.hide(/*closed=*/true);
    }
  }

  addToTaskbar() {
    this.taskbarElement = document.createElement('div');
    this.taskbarElement.className = 'taskbar-view-window';
    this.taskbarElement.innerHTML = this.title;
    this.taskbarElement.style.backgroundImage = this.iconUrl;
    this.taskbarElement.addEventListener('mousedown', (event) => {
      if (activeWindow !== this) {
        this.show(/*opened=*/false);
      } else {
        this.hide(/*closed=*/false);
      }
    });
    document.getElementById('taskbarWindows').appendChild(this.taskbarElement);
  }

  createEvents() {
    this.titleElement.addEventListener('mousedown', (event) => {
      if (event.target.tagName === 'BUTTON') return;
      if (event.buttons & 1) {
        this.dragging = true;
        const style = window.getComputedStyle(this.element);
        this.dragStartX = event.clientX - style.getPropertyValue('--xpos');
        this.dragStartY = event.clientY - style.getPropertyValue('--ypos');
      }
    });
    this.titleElement.querySelector('.view-window-minimize').addEventListener('click', () => {
      this.hide(/*closed=*/false);
    });
    this.titleElement.querySelector('.view-window-maximize').addEventListener('click', () => {
      this.toggleMaximize();
    });
    this.titleElement.addEventListener('dblclick', () => {
      if (event.target.tagName === 'BUTTON') return;
      this.toggleMaximize();
    });
    this.titleElement.querySelector('.view-window-close').addEventListener('click', () => {
      this.hide(/*closed=*/true);
    });
    this.element.addEventListener('mousedown', (event) => {
      this.setAsActive();
    });
  }

  handleMouseMove(clientX, clientY, buttons) {
    if (this.maximized) return;
    if (this.dragging) {
      this.handleMove(clientX, clientY, buttons);
    } else if (this.resizingLeft || this.resizingRight || this.resizingTop || this.resizingBottom) {
      this.handleResize(clientX, clientY, buttons);
    }
  }

  handleMove(clientX, clientY, buttons) {
    if (buttons !== 1) {
      this.dragging = false;
      return;
    }
    const style = window.getComputedStyle(this.element);
    const x = Math.max(Math.min(clientX - this.dragStartX, window.innerWidth - 100), 100 - parseInt(style.width, 10));
    const y = Math.max(Math.min(clientY - this.dragStartY, window.innerHeight - 100), 0);
    this.element.style.setProperty('--xpos', x);
    this.element.style.setProperty('--ypos', y);
  }

  startResize(clientX, clientY, buttons, types) {
    if (buttons !== 1) return;
    const style = window.getComputedStyle(this.element);
    types.forEach((type) => {
      switch (type) {
        case 'e':
          this.anchorX = clientX - parseInt(style.width, 10);
          this.resizingRight = true;
          break;
        case 'w':
          this.anchorX = clientX + parseInt(style.width, 10);
          this.resizingLeft = true;
          break;
        case 'n':
          this.anchorY = clientY + parseInt(style.height, 10);
          this.resizingTop = true;
          break;
        case 's':
          this.anchorY = clientY - parseInt(style.height, 10);      
          this.resizingBottom = true;
          break;
      }
    });
  }

  handleResize(clientX, clientY, buttons, type) {
    if (buttons !== 1) {
      this.resizingLeft = false;
      this.resizingRight = false;
      this.resizingTop = false;
      this.resizingBottom = false;
      document.getElementsByTagName('body')[0].style.removeProperty('cursor');
      return;
    }
    const style = window.getComputedStyle(this.element);
    const minWidth = parseInt(style.minWidth, 10);
    const minHeight = parseInt(style.minHeight, 10);
    if (this.resizingLeft) {
      const newX = Math.min(Math.max(0, Math.min(clientX, window.innerWidth - 100)), this.anchorX - minWidth);
      this.element.style.width = this.anchorX - newX;
      this.element.style.setProperty('--xpos', newX);
    } else if (this.resizingRight) {
      const x = parseInt(style.getPropertyValue('--xpos'), 10);
      const newWidth = Math.max(clientX - this.anchorX, 100 - x);
      this.element.style.width = Math.min(Math.max(newWidth, minWidth), window.innerWidth - x);
    }
    if (this.resizingTop) {
      const newY = Math.min(Math.max(0, Math.min(clientY, window.innerHeight - 100)), this.anchorY - minHeight);
      this.element.style.height = this.anchorY - newY;
      this.element.style.setProperty('--ypos', newY);
    } else if (this.resizingBottom) {
      const y = parseInt(style.getPropertyValue('--ypos'), 10);
      const newHeight = clientY - this.anchorY;
      this.element.style.height = Math.min(Math.max(newHeight, minHeight), window.innerHeight - y);
    }
  }

  fitInWindow() {
    const style = window.getComputedStyle(this.element);
    const x = Math.max(Math.min(style.getPropertyValue('--xpos'), window.innerWidth - 100), 0);
    const y = Math.max(Math.min(style.getPropertyValue('--ypos'), window.innerHeight - 100), 0);
    this.element.style.setProperty('--xpos', x);
    this.element.style.setProperty('--ypos', y);
  }

  toggleMaximize() {
    this.maximized = !this.maximized;
    this.viewBorder.setVisibility(!this.maximized);
    if (this.maximized) {
      this.element.setAttribute('state', 'maximized');
    } else {
      this.element.removeAttribute('state');
    }
  }

  setAsActive() {
    if (activeWindow) {
      activeWindow.setNotActive();
    }
    this.setPriority(21);
    activeWindow = this;
    this.titleElement.setAttribute('state', 'active');
    if (this.taskbarElement) {
      this.taskbarElement.setAttribute('state', 'active');
    }
  }

  setNotActive() {
    this.setPriority(20);
    if (activeWindow === this) {
      activeWindow = undefined;
    }
    this.titleElement.removeAttribute('state');
    if (this.taskbarElement) {
      this.taskbarElement.removeAttribute('state');
    }
  }

  setPriority(priority) {
    this.element.style.zIndex = priority;
  }

  hide(closed) {
    this.element.style.display = 'none';
    if (closed && this.taskbarElement) {
      document.getElementById('taskbarWindows').removeChild(this.taskbarElement);
      this.taskbarElement = undefined;
    }
    this.setNotActive();
  }

  show(opened) {
    this.element.style.removeProperty('display');
    if (opened && !this.taskbarElement) {
      this.addToTaskbar();
    }
    this.setAsActive();
  }
}

class Icon {
  constructor(id, viewWindow) {
    this.id = id;
    this.viewWindow = viewWindow;
    this.dragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.setUp();
  }

  setUp() {
    this.element = document.getElementById(this.id);

    this.element.addEventListener('dblclick', () => {
      this.viewWindow.show(/*opened=*/true);
      this.deselect();
    });
    this.element.addEventListener('mousedown', (event) => {
      if (event.buttons & 1) {
        this.select();
        this.dragging = true;
        const style = window.getComputedStyle(this.element);
        this.dragStartX = event.clientX - style.getPropertyValue('--xpos');
        this.dragStartY = event.clientY - style.getPropertyValue('--ypos');
      }
    });
  }

  handleMouseMove(clientX, clientY, buttons) {
    if (this.dragging) {
      this.handleMove(clientX, clientY, buttons);
    }
  }

  handleMove(clientX, clientY, buttons) {
    if (buttons !== 1) {
      this.dragging = false;
      return;
    }
    const style = window.getComputedStyle(this.element);
    const x = Math.max(Math.min(clientX - this.dragStartX, window.innerWidth - 40), 40 - parseInt(style.width, 10));
    const y = Math.max(Math.min(clientY - this.dragStartY, window.innerHeight - 40), 40 - parseInt(style.height, 10));
    this.element.style.setProperty('--xpos', x);
    this.element.style.setProperty('--ypos', y);
  }

  select() {
    this.element.setAttribute('state', 'selected');
    if (activeIcon && activeIcon !== this) {
      activeIcon.deselect();
    }
    activeIcon = this;
    this.setPriority(11);
  }

  deselect() {
    this.element.removeAttribute('state');
    this.setPriority(10);
    activeIcon = undefined;
  }

  setPriority(priority) {
    this.element.style.zIndex = priority
  }
}

function onLoad() {
  windows.push(new ViewWindow('mainWindow', /*startOpened=*/false));
  windows.push(new ViewWindow('secondaryWindow', /*startOpened=*/false));

  desktopIcons.push(new Icon('mainWindowIcon', windows[0]));
  desktopIcons.push(new Icon('secondaryWindowIcon', windows[1]));

  document.addEventListener('mousedown', (event) => {
    if (event.buttons !== 1) return;
    if (!activeIcon) return;
    for (const name of event.target.classList) {
      if (name.startsWith('icon')) {
        return;
      }
    }
    activeIcon.deselect();
  });
  document.addEventListener('mousemove', (event) => {
    if (activeWindow) {
      activeWindow.handleMouseMove(event.clientX, event.clientY, event.buttons);
    }
    if (activeIcon) {
      activeIcon.handleMouseMove(event.clientX, event.clientY, event.buttons);
    }
  });
  window.addEventListener("resize", () => {
    windows.forEach((w) => w.fitInWindow());
  });
}

window.onload = function() {
  onLoad();
}
