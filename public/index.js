console.log("index.js loaded");

const maxDays = 7;

async function genReportLog(key, url) {
  const response = await fetch("/status");
  let statusLines = "";
  if (response.ok) {
    const data = await response.json();
    console.log("Fetched data:", data); // Debugging log
    statusLines = data
      .filter((entry) => entry.key === key) // Filter by key
      .map((entry) => `${entry.created_at},${entry.result}`)
      .join("\n");
    console.log("Filtered status lines:", statusLines); // Debugging log
  } else {
    console.error("Failed to fetch status data");
  }

  const normalized = normalizeData(statusLines);
  console.log("Normalized data:", normalized); // Debugging log
  const statusStream = constructStatusStream(key, url, normalized);
  return statusStream;
}

function constructStatusStream(key, url, uptimeData) {
  let streamContainer = templatize("statusStreamContainerTemplate");
  for (var ii = maxDays - 1; ii >= 0; ii--) {
    let line = constructStatusLine(key, ii, uptimeData[ii]);
    streamContainer.appendChild(line);
  }

  const lastSet = uptimeData[0];
  const color = getColor(lastSet);

  const container = templatize("statusContainerTemplate", {
    title: key,
    url: url,
    color: color,
    status: getStatusText(color),
    upTime: uptimeData.upTime,
  });

  container.appendChild(streamContainer);
  container.dataset.priority = getPriority(color);
  return container;
}

function constructStatusLine(key, relDay, upTimeArray) {
  let date = new Date();
  date.setDate(date.getDate() - relDay);

  return constructStatusSquare(key, date, upTimeArray);
}

function getColor(uptimeVal) {
  return uptimeVal == null
    ? "nodata"
    : uptimeVal == 1
    ? "success"
    : uptimeVal < 0.3
    ? "failure"
    : "partial";
}

function getPriority(color) {
  return color === "failure" ? 1 : color === "partial" ? 2 : 3;
}

function constructStatusSquare(key, date, uptimeVal) {
  const color = getColor(uptimeVal);
  let square = templatize("statusSquareTemplate", {
    color: color,
    tooltip: getTooltip(key, date, color),
  });

  const show = () => {
    showTooltip(square, key, date, color);
  };
  square.addEventListener("mouseover", show);
  square.addEventListener("mousedown", show);
  square.addEventListener("mouseout", hideTooltip);
  return square;
}

let cloneId = 0;
function templatize(templateId, parameters) {
  let clone = document.getElementById(templateId).cloneNode(true);
  clone.id = "template_clone_" + cloneId++;
  if (!parameters) {
    return clone;
  }

  applyTemplateSubstitutions(clone, parameters);
  return clone;
}

function applyTemplateSubstitutions(node, parameters) {
  const attributes = node.getAttributeNames();
  for (var ii = 0; ii < attributes.length; ii++) {
    const attr = attributes[ii];
    const attrVal = node.getAttribute(attr);
    node.setAttribute(attr, templatizeString(attrVal, parameters));
  }

  if (node.childElementCount == 0) {
    node.innerText = templatizeString(node.innerText, parameters);
  } else {
    const children = Array.from(node.children);
    children.forEach((n) => {
      applyTemplateSubstitutions(n, parameters);
    });
  }
}

function templatizeString(text, parameters) {
  if (parameters) {
    for (const [key, val] of Object.entries(parameters)) {
      text = text.replaceAll("$" + key, val);
    }
  }
  return text;
}

function getStatusText(color) {
  return color == "nodata"
    ? "No Data Available"
    : color == "success"
    ? "Operational"
    : color == "failure"
    ? "Major Outage"
    : color == "partial"
    ? "Partial Outage"
    : "Unknown";
}

function getStatusDescriptiveText(color) {
  return color == "nodata"
    ? "No Data Available: Health check was not performed."
    : color == "success"
    ? "No downtime recorded on this day."
    : color == "failure"
    ? "Major outages recorded on this day."
    : color == "partial"
    ? "Partial outages recorded on this day."
    : "Unknown";
}

function getTooltip(key, date, quartile, color) {
  let statusText = getStatusText(color);
  return `${key} | ${date.toDateString()} : ${quartile} : ${statusText}`;
}

function create(tag, className) {
  let element = document.createElement(tag);
  element.className = className;
  return element;
}

function normalizeData(statusLines) {
  const rows = statusLines.split("\n");
  const dateNormalized = splitRowsByDate(rows);

  let relativeDateMap = {};
  const now = new Date();
  for (let i = 0; i < maxDays; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const dateStr = date.toDateString();

    if (dateNormalized[dateStr]) {
      relativeDateMap[i] = getDayAverage(dateNormalized[dateStr]);
    } else {
      relativeDateMap[i] = null; // No data for this day
    }
  }

  relativeDateMap.upTime = dateNormalized.upTime;
  return relativeDateMap;
}

function getDayAverage(val) {
  if (!val || val.length == 0) {
    return null;
  } else {
    return val.reduce((a, v) => a + v) / val.length;
  }
}

function getRelativeDays(date1, date2) {
  return Math.floor(Math.abs((date1 - date2) / (24 * 3600 * 1000)));
}

function splitRowsByDate(rows) {
  let dateValues = {};
  let sum = 0,
    count = 0;
  for (var ii = 0; ii < rows.length; ii++) {
    const row = rows[ii];
    if (!row) {
      continue;
    }

    const [dateTimeStr, resultStr] = row.split(",", 2);
    const dateTime = new Date(Date.parse(dateTimeStr));
    const dateStr = dateTime.toDateString();

    let resultArray = dateValues[dateStr];
    if (!resultArray) {
      resultArray = [];
      dateValues[dateStr] = resultArray;
      if (Object.keys(dateValues).length > maxDays) {
        break;
      }
    }

    let result = 0;
    if (resultStr.trim() == "success") {
      result = 1;
    }
    sum += result;
    count++;

    resultArray.push(result);
  }

  const upTime = count ? ((sum / count) * 100).toFixed(2) + "%" : "--%";
  dateValues.upTime = upTime;
  return dateValues;
}

let tooltipTimeout = null;
function showTooltip(element, key, date, color) {
  clearTimeout(tooltipTimeout);
  const toolTipDiv = document.getElementById("tooltip");

  document.getElementById("tooltipDateTime").innerText = date.toDateString();
  document.getElementById("tooltipDescription").innerText =
    getStatusDescriptiveText(color);

  const statusDiv = document.getElementById("tooltipStatus");
  statusDiv.innerText = getStatusText(color);
  statusDiv.className = color;

  toolTipDiv.style.top = element.offsetTop + element.offsetHeight + 10;
  toolTipDiv.style.left =
    element.offsetLeft + element.offsetWidth / 2 - toolTipDiv.offsetWidth / 2;
  toolTipDiv.style.opacity = "1";
}

function hideTooltip() {
  tooltipTimeout = setTimeout(() => {
    const toolTipDiv = document.getElementById("tooltip");
    toolTipDiv.style.opacity = "0";
  }, 1000);
}

async function genAllReports() {
  // Check if reports already exist
  const reportsContainer = document.getElementById("reports");
  if (reportsContainer && reportsContainer.children.length > 0) {
    console.log("Reports already exist, skipping generation");
    return; // Skip report generation if containers already exist
  }
  
  const response = await fetch("/urls");
  const configText = await response.text();
  const configLines = configText.split("\n");
  const containers = [];
  console.log(configLines)
  for (let ii = 0; ii < configLines.length; ii++) {
    const configLine = configLines[ii];
    const index = configLine.indexOf('=');
    if (index === -1) continue;
    
    const key = configLine.substring(0, index);
    const url = configLine.substring(index + 1);
    
    if (!key || !url) {
      continue;
    }

    const container = await genReportLog(key, url);
    containers.push(container);
  }

  // // Sort containers by priority
  containers.sort((a, b) => a.dataset.priority - b.dataset.priority);

  // Append sorted containers to the DOM
  containers.forEach(container => {
    reportsContainer.appendChild(container);
  });
  
  console.log(`Generated ${containers.length} report containers`);
}

document.addEventListener('DOMContentLoaded', () => {
    // Create a header element to show alerts
    const alertHeader = document.createElement('div');
    alertHeader.style.textAlign = 'center';
    alertHeader.style.padding = '15px';
    alertHeader.style.fontSize = '24px';
    alertHeader.style.fontWeight = 'bold';
    alertHeader.style.margin = '10px 0';
    
    // Create a connection status indicator
    const connectionStatus = document.createElement('div');
    connectionStatus.style.position = 'fixed';
    connectionStatus.style.top = '10px';
    connectionStatus.style.right = '10px';
    connectionStatus.style.padding = '10px 15px';
    connectionStatus.style.borderRadius = '5px';
    connectionStatus.style.fontWeight = 'bold';
    connectionStatus.style.fontSize = '18px';
    connectionStatus.style.zIndex = '1000'; // Make sure it's on top
    connectionStatus.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    
    // Set initial status
    updateConnectionStatus(connectionStatus, false);
    
    // Insert elements into the page
    if (document.body.firstChild) {
        document.body.insertBefore(alertHeader, document.body.firstChild);
    } else {
        document.body.appendChild(alertHeader);
    }
    document.body.appendChild(connectionStatus);
    
    // Keep track of the current rotation index
    let rotationIndex = 0;
    
    // Don't call genAllReports() from here - it's likely called elsewhere in the original code
    // Just wait for the reports container to have children before initializing Socket.IO
    waitForReportsToLoad().then(() => {
        console.log("Reports loaded, connecting to socket.io");
        initializeSocketConnection();
    }).catch(error => {
        console.error("Error waiting for reports:", error);
        alertHeader.style.backgroundColor = '#e74c3c';
        alertHeader.style.color = 'white';
        alertHeader.textContent = 'ERROR LOADING REPORTS: ' + error.message;
    });
    
    // Function to wait for reports to be loaded
    function waitForReportsToLoad() {
        return new Promise((resolve, reject) => {
            const reportsContainer = document.getElementById("reports");
            
            // If reports are already loaded, resolve immediately
            if (reportsContainer && reportsContainer.children.length > 0) {
                return resolve();
            }
            
            // Otherwise, set up a small polling interval to check
            let attempts = 0;
            const maxAttempts = 20; // Try for ~10 seconds (20 attempts × 500ms)
            
            const checkInterval = setInterval(() => {
                attempts++;
                const reportsContainer = document.getElementById("reports");
                
                if (reportsContainer && reportsContainer.children.length > 0) {
                    clearInterval(checkInterval);
                    resolve();
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    reject(new Error("Timed out waiting for reports to load"));
                }
            }, 500);
        });
    }
    
    // Function to initialize Socket.IO connection
    function initializeSocketConnection() {
        try {
            // Change from default connection to specific URL
            // const socket = io();
            const socket = io('http://192.168.1.101:3030', {
                reconnectionDelayMax: 10000,
                transports: ['websocket']
            });
            
            // Handle connection events
            socket.on('connect', () => {
                console.log('Connected to server');
                updateConnectionStatus(connectionStatus, true);
                
                // Request data immediately after connecting
                socket.emit('requestUpdate');
            });
            
            socket.on('disconnect', () => {
                console.log('Disconnected from server');
                updateConnectionStatus(connectionStatus, false);
                
                alertHeader.style.backgroundColor = '#e74c3c';
                alertHeader.style.color = 'white';
                alertHeader.textContent = 'CONNECTION LOST - RECONNECTING...';
            });
            
            socket.on('connect_error', (error) => {
                console.log('Connection error:', error);
                updateConnectionStatus(connectionStatus, false);
            });
            
            // Receive status updates
            socket.on('statusUpdate', (data) => {
                console.log('Received status update:', data.length, 'items');
                
                // Update the header notification
                updateHeaderStatus(data, alertHeader);
                
                // Simply shuffle the direct children of the reports container
                shuffleReportContainers();
            });
        } catch (error) {
            console.error('Error initializing Socket.IO:', error);
            updateConnectionStatus(connectionStatus, false);
            
            alertHeader.style.backgroundColor = '#e74c3c';
            alertHeader.style.color = 'white';
            alertHeader.textContent = 'CONNECTION ERROR: ' + error.message;
        }
    }
    
    // Function to update connection status indicator
    function updateConnectionStatus(element, isConnected) {
        if (isConnected) {
            element.style.backgroundColor = '#27ae60'; // Green
            element.style.color = 'white';
            element.innerHTML = `
                <span style="display: inline-block; width: 12px; height: 12px; 
                             background-color: white; border-radius: 50%; margin-right: 8px;"></span>
                CONNECTED
            `;
        } else {
            element.style.backgroundColor = '#e74c3c'; // Red
            element.style.color = 'white';
            element.innerHTML = `
                <span style="display: inline-block; width: 12px; height: 12px; 
                             background-color: white; border-radius: 50%; margin-right: 8px;
                             animation: blink 1s infinite;"></span>
                DISCONNECTED
            `;
            
            // Add blinking animation for disconnected state
            const style = document.createElement('style');
            style.textContent = `
                @keyframes blink {
                    0% { opacity: 0.3; }
                    50% { opacity: 1; }
                    100% { opacity: 0.3; }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // Function to update the header status based on failing services
    function updateHeaderStatus(data, headerElement) {
        if (!data || !Array.isArray(data) || data.length === 0) {
            headerElement.style.backgroundColor = '#f8f8f8';
            headerElement.style.color = '#333';
            headerElement.textContent = 'No status data available';
            return;
        }
        
        // Group data by service key
        const services = {};
        data.forEach(item => {
            if (!services[item.key]) {
                services[item.key] = [];
            }
            services[item.key].push(item);
        });
        
        // Find failing services
        const failingServices = [];
        
        for (const [serviceName, entries] of Object.entries(services)) {
            // Sort entries by date (newest first)
            entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            // Check latest entry
            const latestEntry = entries[0];
            if (latestEntry.result !== 'success') {
                failingServices.push(serviceName);
            }
        }
        
        // Update container visibility
        updateContainerVisibility(failingServices);
        
        // Update the header based on failing services
        if (failingServices.length === 0) {
            // All operational
            headerElement.style.backgroundColor = '#27ae60';
            headerElement.style.color = 'white';
            headerElement.textContent = 'ALL SYSTEMS OPERATIONAL';
        } else {
            // Some services are failing
            headerElement.style.backgroundColor = '#e74c3c';
            headerElement.style.color = 'white';
            headerElement.innerHTML = `
                ALERT: ${failingServices.length} SERVICE${failingServices.length > 1 ? 'S' : ''} DOWN
                <div style="font-size: 18px; margin-top: 5px;">
                    ${failingServices.join(', ')}
                </div>
            `;
        }
    }
    
    // Function to update container visibility based on failing services
    function updateContainerVisibility(failingServices) {
        const reportContainers = document.querySelectorAll('#reports > [id^="template_clone_"]');
        
        reportContainers.forEach(container => {
            const titleElement = container.querySelector('.title');
            if (!titleElement) return;
            
            const serviceName = titleElement.textContent.trim();
            const isServiceFailing = failingServices.includes(serviceName);
            
            // Show or hide based on service status
            container.style.display = isServiceFailing ? '' : 'none';
        });
    }
    
    // Simple function to shuffle report containers
    function shuffleReportContainers() {
        const reportsContainer = document.getElementById('reports');
        if (!reportsContainer) {
            console.log("Reports container not found");
            return;
        }
        
        const children = Array.from(reportsContainer.children);
        if (children.length <= 1) {
            console.log("Not enough containers to shuffle");
            return;
        }
        
        console.log(`Shuffling ${children.length} containers`);
        
        // Remove all children
        while (reportsContainer.firstChild) {
            reportsContainer.removeChild(reportsContainer.firstChild);
        }
        
        // Shuffle array
        for (let i = children.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [children[i], children[j]] = [children[j], children[i]];
        }
        
        // Add animation properties to each child
        children.forEach((child, index) => {
            child.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out';
            child.style.opacity = '0';
            child.style.transform = 'translateY(20px)';
            
            // Re-append in new order
            reportsContainer.appendChild(child);
            
            // Trigger animation
            setTimeout(() => {
                child.style.opacity = '1';
                child.style.transform = 'translateY(0)';
            }, 50 * index);
        });
        
        console.log("Container shuffle complete");
    }
});