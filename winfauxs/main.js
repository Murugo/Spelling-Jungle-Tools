const WINDOW_BORDERS = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];

let windows = [];
let activeWindow;

class ViewBorder {
  constructor(viewWindow, parentElement) {
    this.viewWindow = viewWindow;
    this.parentElement = parentElement;
    this.setUp();
  }

  setUp() {
    this.borderElements = [];
    WINDOW_BORDERS.forEach((border) => {
      // TODO: Dynamically add the border to the window element.
      const element = this.parentElement.querySelector(`.view-window-border-${border}`);
      element.addEventListener('mousedown', (event) => {
        this.viewWindow.setAsActive();
        this.viewWindow.startResize(event.clientX, event.clientY, event.buttons, [...border]);
        document.getElementsByTagName('body')[0].style.cursor = `${border}-resize`;
      });
      this.borderElements.push(element);
    });
  }

  setVisibility(visible) {
    this.borderElements.forEach((element) => {
      element.style.visibility = visible ? 'visible' : 'hidden';
    });
  }
}

class ViewWindow {
  constructor(id) {
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
    this.setUp();
  }

  setUp() {
    this.element = document.getElementById(this.id);
    this.titleElement = this.element.querySelector('.view-window-title');
    this.contentElement = this.element.querySelector('.view-window-content');

    this.viewBorder = new ViewBorder(this, this.element);

    this.titleElement.addEventListener('mousedown', (event) => {
      if (event.target.tagName === 'BUTTON') return;
      if (event.buttons & 1) {
        this.dragging = true;
        const style = window.getComputedStyle(this.element);
        this.dragStartX = event.clientX - style.getPropertyValue('--xpos');
        this.dragStartY = event.clientY - style.getPropertyValue('--ypos');
      }
    });
    this.titleElement.querySelector('.view-window-maximize').addEventListener('click', () => {
      this.toggleMaximize();
    });
    this.titleElement.addEventListener('dblclick', () => {
      if (event.target.tagName === 'BUTTON') return;
      this.toggleMaximize();
    });
    this.element.addEventListener('mousedown', (event) => {
      this.setAsActive();
    });

    this.setAsActive();
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
      activeWindow.setPriority(1);
    }
    this.setPriority(100);
    activeWindow = this;
  }

  setPriority(priority) {
    this.element.style.setProperty('z-index', priority)
  }
}

function onLoad() {
  windows.push(new ViewWindow('mainWindow'));
  windows.push(new ViewWindow('secondaryWindow'));

  document.addEventListener('mousemove', (event) => {
    if (activeWindow) {
      activeWindow.handleMouseMove(event.clientX, event.clientY, event.buttons);
    }
  });
  window.addEventListener("resize", () => {
    windows.forEach((w) => w.fitInWindow());
  });
}

window.onload = function() {
  onLoad();
}
