const WINDOW_BORDERS_BEFORE = ['nw', 'n', 'ne', 'w'];
const WINDOW_BORDERS_AFTER = ['e', 'sw', 's', 'se'];

const titleButtonEnum = {
  NONE: 0,
  MINIMIZE: 1,
  MAXIMIZE: 2,
  CLOSE: 4,
};

const alertTypeEnum = {
  INFO: 0,
  WARNING: 1,
  ERROR: 2,
};

const alertButtonEnum = {
  OK: 0,
  CANCEL: 1,
}

let windows = [];
let desktopIcons = [];
let activeWindow;
let activeIcon;

class ViewBorder {
  constructor(viewWindow, parentElement, resizable) {
    this.viewWindow = viewWindow;
    this.parentElement = parentElement;
    this.resizable = resizable;
    this.setUp();
  }

  setUp() {
    this.borderElements = [];
    const addBorderElement = (element, border) => {
      if (this.resizable) {
        element.addEventListener('mousedown', (event) => {
          this.viewWindow.setAsActive();
          this.viewWindow.startResize(event.clientX, event.clientY, event.buttons, [...border]);
          document.getElementsByTagName('body')[0].style.cursor = `${border}-resize`;
        });
      } else {
        element.style.cursor = 'default';
      }
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
  constructor(element,
              startOpened = true,
              resizable = true,
              deleteOnClose = false,
              titleButtons = titleButtonEnum.MINIMIZE | titleButtonEnum.MAXIMIZE | titleButtonEnum.CLOSE) {
    this.element = element;
    this.dragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.resizable = resizable;
    this.resizingLeft = false;
    this.resizingRight = false;
    this.resizingTop = false;
    this.resizingBottom = false;
    this.anchorX = 0;
    this.anchorY = 0;
    this.deleteOnClose = deleteOnClose;
    this.maximized = false;
    this.setUp(startOpened, titleButtons);
  }

  setUp(startOpened, titleButtons) {
    this.contentElement = this.element.querySelector('.view-window-content');

    this.createTitle(titleButtons);
    this.viewBorder = new ViewBorder(this, this.element, this.resizable);
    this.createEvents();
    if (startOpened) {
      this.open();
    } else {
      this.close();
    }
  }

  createTitle(titleButtons) {
    this.titleElement = document.createElement('div');
    this.titleElement.className = 'view-window-title';
    const textElement = document.createElement('div');
    textElement.className = 'view-window-title-text';
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'view-window-title-buttons';
    this.titleElement.appendChild(textElement);
    this.titleElement.appendChild(buttonsContainer);
    this.element.querySelector('.view-window-inner').prepend(this.titleElement);

    if (titleButtons & titleButtonEnum.MINIMIZE) {
      this.minimizeButtonElement = document.createElement('button');
      this.minimizeButtonElement.className = 'view-window-minimize';
      buttonsContainer.appendChild(this.minimizeButtonElement);
    }
    if (titleButtons & titleButtonEnum.MAXIMIZE) {
      this.maximizeButtonElement = document.createElement('button');
      this.maximizeButtonElement.className = 'view-window-maximize';
      buttonsContainer.appendChild(this.maximizeButtonElement);
    }
    if (titleButtons & titleButtonEnum.CLOSE) {
      this.closeButtonElement = document.createElement('button');
      this.closeButtonElement.className = 'view-window-close';
      buttonsContainer.appendChild(this.closeButtonElement);
    }

    const style = window.getComputedStyle(this.element);
    this.title = style.getPropertyValue('--title').trim().replaceAll("\"", "");
    this.iconUrl = style.getPropertyValue('--icon');
    this.titleElement.querySelector('.view-window-title-text').innerHTML = this.title;
  }

  addToTaskbar() {
    this.taskbarElement = document.createElement('div');
    this.taskbarElement.className = 'taskbar-view-window';
    this.taskbarElement.innerHTML = this.title;
    this.taskbarElement.style.backgroundImage = this.iconUrl;
    this.taskbarElement.addEventListener('mousedown', (event) => {
      if (activeWindow !== this) {
        this.show();
      } else {
        this.hide();
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
    if (this.minimizeButtonElement) {
      this.minimizeButtonElement.addEventListener('click', () => {
        this.hide();
      });
    }
    if (this.maximizeButtonElement) {
      this.maximizeButtonElement.addEventListener('click', () => {
        this.toggleMaximize();
      });
      this.titleElement.addEventListener('dblclick', () => {
        if (event.target.tagName === 'BUTTON') return;
        this.toggleMaximize();
      });
    }
    if (this.closeButtonElement) {
      this.closeButtonElement.addEventListener('click', () => {
        this.close();
      });
    }
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

  hide() {
    this.element.style.display = 'none';
    this.setNotActive();
  }

  close() {
    this.hide();
    if (this.taskbarElement) {
      document.getElementById('taskbarWindows').removeChild(this.taskbarElement);
      this.taskbarElement = undefined;
    }
    if (this.deleteOnClose) {
      windows.splice(windows.indexOf(this), 1);
      document.body.removeChild(this.element);
    }
  }

  show() {
    this.element.style.removeProperty('display');
    this.setAsActive();
  }

  open() {
    this.show();
    if (!this.taskbarElement) {
      this.addToTaskbar();
    }
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
      this.viewWindow.open();
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

function alert(title, message, alertType, buttons = [alertButtonEnum.OK]) {
  const windowElement = document.createElement('div');
  windowElement.className = 'view-window';
  windowElement.style.setProperty('--title', title);
  windowElement.style.setProperty('--noIconMargin', '4px');
  windowElement.style.height = 'auto';
  windowElement.style.minHeight = 0;

  const innerElement = document.createElement('div');
  innerElement.className = 'view-window-inner';
  windowElement.appendChild(innerElement);

  const contentElement = document.createElement('div');
  contentElement.className = 'view-window-content';
  innerElement.appendChild(contentElement);

  const alertElement = document.createElement('div');
  alertElement.className = 'view-window-alert';
  contentElement.appendChild(alertElement);

  const messageElement = document.createElement('div');
  messageElement.className = 'view-window-alert-message';
  alertElement.appendChild(messageElement);

  const iconElement = document.createElement('div');
  iconElement.className = 'view-window-alert-message-icon';
  switch (alertType) {
    case alertTypeEnum.INFO:
      iconElement.setAttribute('state', 'info');
      break;
    case alertTypeEnum.WARNING:
      iconElement.setAttribute('state', 'warning');
      break;
    case alertTypeEnum.ERROR:
      iconElement.setAttribute('state', 'error');
      break;
  }
  messageElement.appendChild(iconElement);

  const textElement = document.createElement('div');
  textElement.className = 'view-window-alert-message-text';
  textElement.innerHTML = message;
  messageElement.appendChild(textElement);

  document.body.prepend(windowElement);
  
  const viewWindow = new ViewWindow(
    windowElement,
    /*startOpened=*/true,
    /*resizable=*/false,
    /*deleteOnClose=*/true,
    titleButtonEnum.NONE);
  windows.push(viewWindow);

  const buttonsElement = document.createElement('div');
  buttonsElement.className = 'view-window-alert-buttons';
  alertElement.appendChild(buttonsElement);

  buttons.forEach((buttonType) => {
    const buttonElement = document.createElement('button');
    switch (buttonType) {
      case alertButtonEnum.OK:
        buttonElement.innerHTML = "OK";
        buttonElement.addEventListener('click', () => {
          viewWindow.close();
        })
        break;
    };
    buttonsElement.append(buttonElement);
  });

  const rect = windowElement.getBoundingClientRect();
  windowElement.style.setProperty('--xpos', (window.innerWidth - rect.width) / 2);
  windowElement.style.setProperty('--ypos', (window.innerHeight - rect.height) / 2);
}

function onLoad() {
  windows.push(new ViewWindow(document.querySelector('#mainWindow'), /*startOpened=*/false));
  windows.push(new ViewWindow(document.querySelector('#secondaryWindow'), /*startOpened=*/false));

  desktopIcons.push(new Icon('mainWindowIcon', windows[0]));
  desktopIcons.push(new Icon('secondaryWindowIcon', windows[1]));

  alert('Welcome', '<3', alertTypeEnum.INFO);

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
