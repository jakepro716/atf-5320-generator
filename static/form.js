document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("nfa-form");

  const getTodayYYYYMMDD = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, "0");
    const day = today.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // --- STATE MANAGEMENT ---
  const serializeForm = (includeDefaults = false) => {
    const data = {};
    const elements = form.elements;
    const processedCheckboxGroups = new Set();
    const todayString = getTodayYYYYMMDD();

    for (const el of elements) {
      if (!el.name || el.disabled) continue;

      switch (el.type) {
        case "checkbox":
          const groupName = el.name;
          if (processedCheckboxGroups.has(groupName)) continue;

          const groupElements = form.elements[groupName];
          if (groupElements.length === undefined) {
            // Single boolean checkbox
            // Special handling for q3a_sameAs2: only store if unchecked (false) unless includeDefaults is true
            if (groupName === "q3a_sameAs2") {
              if (!el.checked) {
                data[groupName] = false;
              } else if (includeDefaults) {
                data[groupName] = true;
              }
            } else {
              data[groupName] = el.checked;
            }
          } else {
            // Group of checkboxes with values
            const checkedValues = Array.from(groupElements)
              .filter((c) => c.checked)
              .map((c) => c.value);
            if (checkedValues.length > 0) {
              data[groupName] = checkedValues;
            }
          }
          processedCheckboxGroups.add(groupName);
          break;
        case "radio":
          if (el.checked && el.value) {
            data[el.name] = el.value;
          }
          break;
        case "text":
        case "email":
        case "tel":
          // Handle special case for 'other' radio/checkbox text input
          if (el.name.endsWith("_other")) {
            const baseName = el.name.replace("_other", "");
            const controls = form.elements[baseName];
            const otherControl = Array.from(controls.length ? controls : [controls]).find(
              (r) => r.value === "OTHER"
            );
            if (otherControl && otherControl.checked && el.value) {
              data[el.name] = el.value.toUpperCase();
            }
          } else if (el.value) {
            data[el.name] = el.value.toUpperCase();
          }
          break;
        case "date":
          // Special handling for certificationDate: only store if not blank and not today
          if (el.name === "certificationDate") {
            if (el.value && el.value !== todayString) {
              data[el.name] = el.value;
            }
          } else if (el.value) {
            data[el.name] = el.value;
          }
          break;
        default:
          if (el.value) {
            // Normalize textarea values to uppercase
            if (el.tagName === "TEXTAREA") {
              data[el.name] = el.value.toUpperCase();
            } else {
              data[el.name] = el.value;
            }
          }
          break;
      }
    }

    // Include signature data if available
    if (signatureManager) {
      const strokes = signatureManager.getStrokes();
      if (strokes) {
        data.signature = strokes;
      }
    }

    return data;
  };

  const deserializeForm = (data) => {
    // Restore signature data if present
    if (data.signature && signatureManager) {
      signatureManager.setStrokes(data.signature);
    }

    for (const key in data) {
      if (key === "signature") continue;
      const elements = form.elements[key];
      if (!elements) continue;

      let value = data[key];
      const el = elements.length && !elements.tagName ? elements[0] : elements;

      if (el.type === "radio") {
        for (const radio of elements) {
          radio.checked = radio.value === value;
        }
      } else if (el.type === "checkbox") {
        if (typeof value === "boolean") {
          elements.checked = value;
        } else {
          for (const checkbox of elements) {
            checkbox.checked = value.includes(checkbox.value);
          }
        }
      } else {
        // Normalize text values to uppercase when rehydrating
        if (
          typeof value === "string" &&
          (el.type === "text" ||
            el.type === "email" ||
            el.type === "tel" ||
            el.tagName === "TEXTAREA")
        ) {
          value = value.toUpperCase();
        }
        el.value = value;
      }
    }
  };

  const applyPrefillConfig = () => {
    if (!window.PREFILL_CONFIG) return;

    const config = window.PREFILL_CONFIG;
    const prefillData = {};

    for (const fieldName in config) {
      const fieldConfig = config[fieldName];
      if (!fieldConfig) continue;

      const element = form.elements[fieldName];
      if (!element) continue;

      // Only prefill if no value from hash
      const hasValueFromHash = (el) => {
        if (el.type === "radio" || el.type === "checkbox") {
          return Array.from(el.length ? el : [el]).some((e) => e.checked);
        }
        return !!el.value;
      };

      if (!hasValueFromHash(element)) {
        let value = fieldConfig.value;

        // Format phone/SSN if needed
        if (fieldName === "q3b_telephone" && typeof value === "string") {
          const digits = value.replace(/\D/g, "");
          if (digits.length === 10) {
            value = `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6, 10)}`;
          }
        } else if (fieldName === "q3f_ssn" && typeof value === "string") {
          const cleaned = value.replace(/\D/g, "");
          if (cleaned.length === 9) {
            value = `${cleaned.substring(0, 3)}-${cleaned.substring(3, 5)}-${cleaned.substring(5, 9)}`;
          }
        }

        // Uppercase text values
        if (
          typeof value === "string" &&
          (element.type === "text" ||
            element.type === "email" ||
            element.type === "tel" ||
            element.tagName === "TEXTAREA")
        ) {
          value = value.toUpperCase();
        }

        prefillData[fieldName] = value;
      }
    }

    if (Object.keys(prefillData).length > 0) {
      deserializeForm(prefillData);
    }
  };

  const applyReadonlyLocks = () => {
    if (!window.PREFILL_CONFIG) return;

    for (const fieldName in window.PREFILL_CONFIG) {
      const fieldConfig = window.PREFILL_CONFIG[fieldName];
      if (!fieldConfig || !fieldConfig.readonly) continue;

      const elements = form.elements[fieldName];
      if (!elements) continue;

      const elementList = elements.length && !elements.tagName ? Array.from(elements) : [elements];
      elementList.forEach((el) => {
        el.disabled = true;
        el.classList.add("prefill-locked");

        // Add lock icon indicator
        const container = el.closest(".question-group, .radio-group, .checkbox-group, .sub-input");
        if (container && !container.querySelector(".prefill-lock-indicator")) {
          const indicator = document.createElement("span");
          indicator.className = "prefill-lock-indicator";
          indicator.title = "This field is locked by prefill configuration";
          indicator.innerHTML = "🔒";

          const label =
            container.querySelector(`label[for="${el.id}"]`) ||
            el.previousElementSibling ||
            container.querySelector("legend");
          if (label) {
            label.appendChild(indicator);
          }
        }
      });
    }
  };

  const lockRelatedOtherFields = () => {
    if (!window.PREFILL_CONFIG) return;

    const otherFieldMap = {
      q4a_firearmType: "q4a_firearmType_other",
      q9a_citizenship: "q9a_citizenship_other",
      q9c_birthCountry: "q9c_birthCountry_other",
    };

    for (const [parentField, otherField] of Object.entries(otherFieldMap)) {
      const parentConfig = window.PREFILL_CONFIG[parentField];
      if (!parentConfig || !parentConfig.readonly) continue;

      const parentElement = form.elements[parentField];
      const otherElement = document.getElementById(otherField);

      if (parentElement && otherElement) {
        const otherSelected = Array.from(
          parentElement.length ? parentElement : [parentElement]
        ).some((el) => el.checked && el.value === "OTHER");

        if (otherSelected) {
          otherElement.disabled = true;
          otherElement.classList.add("prefill-locked");
        }
      }
    }
  };

  const debounce = (func, delay) => {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  };

  const STORAGE_KEY = "atf5320_form_data";
  const REMEMBER_KEY = "atf5320_remember";

  // Get the active storage backend
  const getStorage = () => {
    return localStorage.getItem(REMEMBER_KEY) === "true"
      ? localStorage
      : sessionStorage;
  };

  const saveStateToStorage = () => {
    const data = serializeForm();
    const storage = getStorage();
    if (Object.keys(data).length > 0) {
      storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else {
      storage.removeItem(STORAGE_KEY);
    }
  };

  const loadStateFromStorage = () => {
    // Check for legacy URL hash data — migrate if present
    if (window.location.hash && window.location.hash.length > 1) {
      try {
        let base64String = window.location.hash
          .substring(1)
          .replace(/-/g, "+")
          .replace(/_/g, "/");
        const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
        const jsonString = atob(base64String + padding);
        const data = JSON.parse(jsonString);

        // Check if storage already has data (conflict)
        const existingLocal = localStorage.getItem(STORAGE_KEY);
        const existingSession = sessionStorage.getItem(STORAGE_KEY);

        if (existingLocal || existingSession) {
          const useLink = confirm(
            "Found saved data on this device AND in the link URL.\n\n" +
            "OK = Use the data from the link (overwrites local data)\n" +
            "Cancel = Keep local data (ignore the link)"
          );
          if (!useLink) {
            history.replaceState(null, "", window.location.pathname + window.location.search);
            const stored = (existingLocal || existingSession);
            deserializeForm(JSON.parse(stored));
            return;
          }
        }

        deserializeForm(data);
        getStorage().setItem(STORAGE_KEY, JSON.stringify(data));
        history.replaceState(null, "", window.location.pathname + window.location.search);
        console.log("Migrated form data from URL hash to browser storage");
        return;
      } catch (e) {
        console.error("Failed to load state from hash:", e);
      }
    }

    // Load from localStorage first (if remember me), then sessionStorage
    const stored = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        deserializeForm(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to load state from storage:", e);
      }
    }
  };

  // --- VALIDATION ---
  const validations = {
    q3b_telephone: {
      check: (v) => !v || /^[\d\s\(\)-]+$/.test(v),
      msg: "Must only contain digits and separators.",
    },
    q3c_email: {
      check: (v) => !v || /.+@.+/.test(v),
      msg: "Must be a valid email format.",
    },
    q3f_ssn: {
      check: (v) => !v || /^(\d{3}-\d{2}-\d{4}|\d{9}|[a-zA-Z0-9]{8})$/.test(v),
      msg: "Must be a 9-digit SSN or 8-character UPIN.",
    },
    q3g_dob: {
      check: (v) => !v || new Date(v) <= new Date(),
      msg: "Date of Birth cannot be in the future.",
    },
  };

  const validateField = (field) => {
    if (!field) return true;
    const errorContainer = document.getElementById(field.id + "-error");
    const rule = validations[field.name];
    const value = field.value;
    const isValid = !rule || rule.check(value);

    if (isValid) {
      field.classList.remove("invalid-field");
      if (errorContainer) errorContainer.textContent = "";
    } else {
      field.classList.add("invalid-field");
      if (errorContainer) errorContainer.textContent = rule.msg;
    }
    return isValid;
  };

  const runAllValidations = () => {
    let allValid = true;
    Object.keys(validations).forEach((fieldName) => {
      const field = form.elements[fieldName];
      if (!validateField(field)) {
        allValid = false;
      }
    });
    return allValid;
  };

  // --- UPPERCASE NORMALIZATION ---

  // Function to normalize text inputs to uppercase
  const normalizeToUppercase = (element) => {
    if (
      element.type === "text" ||
      element.type === "email" ||
      element.type === "tel" ||
      element.tagName === "TEXTAREA"
    ) {
      const cursorPos = element.selectionStart;
      const cursorEnd = element.selectionEnd;
      const originalValue = element.value;
      const upperValue = originalValue.toUpperCase();

      if (originalValue !== upperValue) {
        element.value = upperValue;
        // Restore cursor position
        element.setSelectionRange(cursorPos, cursorEnd);
      }
    }
  };

  // Add input event listeners for real-time uppercase conversion
  form.addEventListener("input", (e) => {
    normalizeToUppercase(e.target);
  });

  form.addEventListener("input", debounce(saveStateToStorage, 150));
  form.addEventListener("change", saveStateToStorage);

  // --- DYNAMIC FIELD LOGIC & FORMATTING ---

  // Auto-expanding textareas with line limits
  const textareaLineLimits = {
    q2_address: 2,
    q3a_homeAddress: 7,
    q5_address: 2,
    q4b_address: 2,
    q3d_otherNames: 2,
  };

  const autoResizeTextarea = (el) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  const limitTextareaLines = (textarea) => {
    const maxLines = textareaLineLimits[textarea.name];
    if (!maxLines) return;

    const lines = textarea.value.split("\n");
    if (lines.length > maxLines) {
      lines.splice(maxLines);
      textarea.value = lines.join("\n");
    }
  };

  form.querySelectorAll("textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      limitTextareaLines(textarea);
      autoResizeTextarea(textarea);
    });
  });

  // Q3a: Same as 2
  const sameAsCheckbox = document.getElementById("q3a_sameAs2");
  const q2Address = document.getElementById("q2_address");
  const q3aHomeAddress = document.getElementById("q3a_homeAddress");

  const syncAddress = () => {
    if (sameAsCheckbox.checked) {
      q3aHomeAddress.value = q2Address.value;
      q3aHomeAddress.disabled = true;
      q3aHomeAddress.dispatchEvent(new Event("input", { bubbles: true })); // to trigger resize
    } else {
      q3aHomeAddress.disabled = false;
    }
  };
  sameAsCheckbox.addEventListener("change", syncAddress);
  q2Address.addEventListener("input", syncAddress);

  // Q3b Phone Formatting
  const phoneInput = document.getElementById("q3b_telephone");
  phoneInput.addEventListener("blur", (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (digits.length === 10) {
      e.target.value = `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6, 10)}`;
    }
    // Ensure uppercase after formatting
    normalizeToUppercase(e.target);
  });

  // Q3f SSN Formatting
  const ssnInput = document.getElementById("q3f_ssn");
  ssnInput.addEventListener("blur", (e) => {
    const cleaned = e.target.value.replace(/\D/g, "");
    if (cleaned.length === 9) {
      e.target.value = `${cleaned.substring(0, 3)}-${cleaned.substring(3, 5)}-${cleaned.substring(5, 9)}`;
    }
    // Ensure uppercase after formatting
    normalizeToUppercase(e.target);
  });

  // Q4a: Other firearm type text input
  const otherFirearmRadio = document.getElementById("q4a_other");
  const otherFirearmText = document.getElementById("q4a_other_text");
  form.elements.q4a_firearmType.forEach((radio) => {
    radio.addEventListener("change", () => {
      const isOther = otherFirearmRadio.checked;
      otherFirearmText.disabled = !isOther;
      if (!isOther) otherFirearmText.value = "";
      if (isOther) otherFirearmText.focus();
    });
  });

  // Q6: All No button
  document.getElementById("q6_allNo").addEventListener("click", () => {
    const prohibitors = document.getElementById("q6_prohibitors");
    prohibitors.querySelectorAll('input[type="radio"][value="NO"]').forEach((radio) => {
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const q6m2na = document.getElementById("q6m2-na");
    q6m2na.checked = true;
    q6m2na.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // Q6m: Dependency logic
  const q6m1Radios = form.elements.q6m1_nonimmigrant;
  const q6m2Radios = form.elements.q6m2_exception;
  const updateQ6m2 = () => {
    const q6m1Yes = document.getElementById("q6m1-yes").checked;
    const q6m1No = document.getElementById("q6m1-no").checked;

    if (q6m1Yes) {
      document.getElementById("q6m2-yes").disabled = false;
      document.getElementById("q6m2-no").disabled = false;
      document.getElementById("q6m2-na").disabled = true;
      if (document.getElementById("q6m2-na").checked) {
        q6m2Radios.forEach((r) => (r.checked = false));
      }
    } else if (q6m1No) {
      document.getElementById("q6m2-yes").disabled = true;
      document.getElementById("q6m2-no").disabled = true;
      document.getElementById("q6m2-na").disabled = false;
      document.getElementById("q6m2-na").checked = true;
    } else {
      // Neither selected
      q6m2Radios.forEach((r) => {
        r.disabled = true;
        r.checked = false;
      });
    }
  };
  q6m1Radios.forEach((r) => r.addEventListener("change", updateQ6m2));

  // Q8: UPIN dependency
  const upinRadios = form.elements.q8_hasUpin;
  const upinNumberInput = document.getElementById("q8_upinNumber");
  const updateUpinInput = () => {
    const hasUpin = document.getElementById("q8_upin-yes").checked;
    upinNumberInput.disabled = !hasUpin;
    if (!hasUpin) upinNumberInput.value = "";
  };
  upinRadios.forEach((r) => r.addEventListener("change", updateUpinInput));

  // Q9a: Citizenship dependency
  const q9aOtherCheckbox = document.getElementById("q9a_other");
  const q9aOtherText = document.getElementById("q9a_other_text");
  q9aOtherCheckbox.addEventListener("change", () => {
    const isOther = q9aOtherCheckbox.checked;
    q9aOtherText.disabled = !isOther;
    if (!isOther) q9aOtherText.value = "";
    if (isOther) q9aOtherText.focus();
  });

  // Q9c: Country of Birth dependency
  const q9cBirthCountryRadios = form.elements.q9c_birthCountry;
  const q9cOtherText = document.getElementById("q9c_other_text");
  const updateQ9cInput = () => {
    const isOther = document.getElementById("q9c_other").checked;
    q9cOtherText.disabled = !isOther;
    if (!isOther) q9cOtherText.value = "";
    if (isOther) q9cOtherText.focus();
  };
  q9cBirthCountryRadios.forEach((r) => r.addEventListener("change", updateQ9cInput));

  // Fill shared blurbs from template
  const blurbTemplate = document.getElementById("blurb-prohibited-person");
  document.querySelectorAll(".blurb-content-container").forEach((container) => {
    const blurbSpan = document.createElement("span");
    blurbSpan.className = "blurb-content";
    blurbSpan.innerHTML = blurbTemplate.innerHTML;
    container.appendChild(blurbSpan);
  });

  // --- TOUCH-FRIENDLY BLURB FUNCTIONALITY ---
  const isTouchDevice = () => {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  };

  const initializeBlurbHandlers = () => {
    const blurbTriggers = document.querySelectorAll(".blurb-trigger");
    let currentlyOpenBlurb = null;

    // Function to hide all blurbs
    const hideAllBlurbs = () => {
      blurbTriggers.forEach((trigger) => {
        const blurb = trigger.querySelector(".blurb-content");
        if (blurb) {
          blurb.classList.remove("touch-visible");
          trigger.setAttribute("aria-expanded", "false");
          blurb.setAttribute("aria-hidden", "true");
        }
      });
      currentlyOpenBlurb = null;
    };

    // Function to show a specific blurb
    const showBlurb = (trigger) => {
      const blurb = trigger.querySelector(".blurb-content");
      if (blurb) {
        blurb.classList.add("touch-visible");
        trigger.setAttribute("aria-expanded", "true");
        blurb.setAttribute("aria-hidden", "false");
        currentlyOpenBlurb = trigger;
      }
    };

    // Add ARIA attributes for accessibility
    blurbTriggers.forEach((trigger) => {
      const blurb = trigger.querySelector(".blurb-content");
      if (blurb) {
        // Add unique IDs for proper ARIA relationship
        const triggerId = "blurb-trigger-" + Math.random().toString(36).substr(2, 9);
        const blurbId = "blurb-content-" + Math.random().toString(36).substr(2, 9);

        trigger.setAttribute("id", triggerId);
        trigger.setAttribute("aria-describedby", blurbId);
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("role", "button");
        trigger.setAttribute("tabindex", "0");

        blurb.setAttribute("id", blurbId);
        blurb.setAttribute("role", "tooltip");
        blurb.setAttribute("aria-hidden", "true");
      }
    });

    // For touch devices, use click/tap events
    if (isTouchDevice()) {
      blurbTriggers.forEach((trigger) => {
        const blurb = trigger.querySelector(".blurb-content");
        if (blurb) {
          trigger.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (currentlyOpenBlurb === trigger) {
              // If this blurb is already open, close it
              hideAllBlurbs();
            } else {
              // Close any open blurb and open this one
              hideAllBlurbs();
              showBlurb(trigger);
            }
          });

          // Handle keyboard navigation
          trigger.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              trigger.click();
            } else if (e.key === "Escape") {
              hideAllBlurbs();
            }
          });
        }
      });

      // Close blurbs when clicking outside
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".blurb-trigger")) {
          hideAllBlurbs();
        }
      });

      // Close blurbs when scrolling (mobile UX improvement)
      let scrollTimer;
      window.addEventListener("scroll", () => {
        if (currentlyOpenBlurb) {
          clearTimeout(scrollTimer);
          scrollTimer = setTimeout(hideAllBlurbs, 100);
        }
      });
    } else {
      // For non-touch devices, enhance hover with keyboard support
      blurbTriggers.forEach((trigger) => {
        trigger.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const blurb = trigger.querySelector(".blurb-content");
            if (blurb) {
              blurb.style.display = blurb.style.display === "block" ? "none" : "block";
              trigger.setAttribute(
                "aria-expanded",
                blurb.style.display === "block" ? "true" : "false"
              );
            }
          }
        });

        trigger.addEventListener("blur", () => {
          const blurb = trigger.querySelector(".blurb-content");
          if (blurb) {
            blurb.style.display = "none";
            trigger.setAttribute("aria-expanded", "false");
          }
        });
      });
    }
  };

  // Initialize blurb handlers
  initializeBlurbHandlers();

  // Clear Form Button
  document.getElementById("clear-form").addEventListener("click", () => {
    if (confirm("Are you sure you want to clear all fields? This cannot be undone.")) {
      form.reset();
      // Clear signature
      if (signatureManager) signatureManager.clear();
      // Reapply prefill configuration to restore locked fields
      applyPrefillConfig();
      applyReadonlyLocks();
      lockRelatedOtherFields();
      // After reset, re-run all UI update functions to correctly set disabled states etc.
      runAllUIUpdates();
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
      // Don't remove REMEMBER_KEY — that's a preference, not user data
    }
  });

  // --- Clear Section Button Logic ---
  document.querySelectorAll(".clear-question-group").forEach((button) => {
    button.addEventListener("click", (e) => {
      const fieldset = e.target.closest(".question-group");
      if (fieldset) {
        // Special case: if this fieldset contains the signature canvas, clear signature
        if (fieldset.querySelector("#signature-canvas") && signatureManager) {
          signatureManager.clear();
          return;
        }

        const elements = fieldset.querySelectorAll("input, textarea, select");
        elements.forEach((el) => {
          // Skip prefill-locked fields
          if (el.classList.contains("prefill-locked")) {
            return;
          }

          switch (el.type) {
            case "text":
            case "textarea":
            case "email":
            case "tel":
            case "date":
              el.value = el.defaultValue;
              break;
            case "checkbox":
            case "radio":
              el.checked = el.defaultChecked;
              break;
            case "select-one":
            case "select-multiple":
              Array.from(el.options).forEach((option) => {
                option.selected = option.defaultSelected;
              });
              break;
          }
          // Trigger events to update UI (like disabled states) and save to hash
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
        });
      }
    });
  });

  // Expose serializeForm function globally for TypeScript access
  // Include readonly prefill values in PDF generation
  window.serializeForm = () => {
    const data = serializeForm(true);

    // Include readonly prefill values for PDF generation
    if (window.PREFILL_CONFIG) {
      for (const fieldName in window.PREFILL_CONFIG) {
        const fieldConfig = window.PREFILL_CONFIG[fieldName];
        if (fieldConfig && fieldConfig.readonly && !(fieldName in data)) {
          data[fieldName] = fieldConfig.value;
        }
      }
    }

    // Include signature strokes for PDF generation
    if (signatureManager) {
      const strokes = signatureManager.getStrokes();
      if (strokes) {
        data.signature = strokes;
      }
    }

    return data;
  };

  // --- SIGNATURE PAD ---
  class SignatureManager {
    constructor(inputCanvas, renderCanvas) {
      this.inputCanvas = inputCanvas;
      this.renderCanvas = renderCanvas;
      this.inputCtx = inputCanvas.getContext("2d");
      this.renderCtx = renderCanvas.getContext("2d");
      this.strokes = [];
      this.currentStroke = null;
      this.isDrawing = false;

      this._bindEvents();
      this._drawBaseline();
    }

    _getPointerPosition(e) {
      const rect = this.inputCanvas.getBoundingClientRect();
      const scaleX = this.inputCanvas.width / rect.width;
      const scaleY = this.inputCanvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    }

    _bindEvents() {
      const canvas = this.inputCanvas;

      // Pointer events for unified mouse/touch handling
      canvas.addEventListener("pointerdown", (e) => {
        if (e.button && e.button !== 0) return;
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        this.isDrawing = true;
        const pos = this._getPointerPosition(e);
        this.currentStroke = [pos];
        this._drawCurrentStroke();
      });

      canvas.addEventListener("pointermove", (e) => {
        if (!this.isDrawing) return;
        e.preventDefault();
        const pos = this._getPointerPosition(e);
        this.currentStroke.push(pos);
        this._drawCurrentStroke();
      });

      const endStroke = (e) => {
        if (!this.isDrawing) return;
        e.preventDefault();
        this.isDrawing = false;
        if (this.currentStroke && this.currentStroke.length > 0) {
          this.strokes.push(this.currentStroke);
        }
        this.currentStroke = null;
        this._clearInputCanvas();
        this._renderAllStrokes();
        this._dispatchChange();
      };

      canvas.addEventListener("pointerup", endStroke);
      canvas.addEventListener("pointercancel", endStroke);
    }

    _clearInputCanvas() {
      this.inputCtx.clearRect(0, 0, this.inputCanvas.width, this.inputCanvas.height);
    }

    _clearRenderCanvas() {
      this.renderCtx.clearRect(0, 0, this.renderCanvas.width, this.renderCanvas.height);
      this._drawBaseline();
    }

    _drawBaseline() {
      const ctx = this.renderCtx;
      const y = this.renderCanvas.height * 0.7;
      ctx.save();
      ctx.strokeStyle = "#bbb";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(this.renderCanvas.width - 10, y);
      ctx.stroke();
      ctx.restore();
    }

    _catmullRomPoint(p0, p1, p2, p3, t) {
      const t2 = t * t;
      const t3 = t2 * t;
      return {
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      };
    }

    _drawSplineStroke(ctx, points) {
      if (points.length === 0) return;

      ctx.beginPath();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (points.length === 1) {
        // Single point — draw a dot
        ctx.arc(points[0].x, points[0].y, 1, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      if (points.length === 2) {
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.stroke();
        return;
      }

      // Catmull-Rom spline through all points
      ctx.moveTo(points[0].x, points[0].y);

      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)];
        const p1 = points[i];
        const p2 = points[Math.min(i + 1, points.length - 1)];
        const p3 = points[Math.min(i + 2, points.length - 1)];

        const steps = 10;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const pt = this._catmullRomPoint(p0, p1, p2, p3, t);
          ctx.lineTo(pt.x, pt.y);
        }
      }

      ctx.stroke();
    }

    _drawCurrentStroke() {
      this._clearInputCanvas();
      if (this.currentStroke) {
        this._drawSplineStroke(this.inputCtx, this.currentStroke);
      }
    }

    _renderAllStrokes() {
      this._clearRenderCanvas(); // also draws baseline
      for (const stroke of this.strokes) {
        this._drawSplineStroke(this.renderCtx, stroke);
      }
    }

    _dispatchChange() {
      this.inputCanvas.dispatchEvent(new CustomEvent("signaturechange", { bubbles: true }));
    }

    undo() {
      if (this.strokes.length > 0) {
        this.strokes.pop();
        this._renderAllStrokes();
        this._dispatchChange();
      }
    }

    clear() {
      this.strokes = [];
      this.currentStroke = null;
      this.isDrawing = false;
      this._clearInputCanvas();
      this._clearRenderCanvas();
      this._dispatchChange();
    }

    getStrokes() {
      return this.strokes.length > 0 ? this.strokes : null;
    }

    setStrokes(strokes) {
      this.strokes = strokes || [];
      this._renderAllStrokes();
    }
  }

  // Initialize signature pad
  const signatureInputCanvas = document.getElementById("signature-canvas");
  const signatureRenderCanvas = document.getElementById("signature-render-canvas");
  let signatureManager = null;

  if (signatureInputCanvas && signatureRenderCanvas) {
    signatureManager = new SignatureManager(signatureInputCanvas, signatureRenderCanvas);

    // Undo button
    document.getElementById("signature-undo").addEventListener("click", () => {
      signatureManager.undo();
    });

    // Clear button
    document.getElementById("signature-clear").addEventListener("click", () => {
      signatureManager.clear();
    });

    // Save on signature change
    signatureInputCanvas.addEventListener("signaturechange", () => {
      saveStateToStorage();
    });
  }

  // Expose signature strokes getter for TypeScript
  window.getSignatureStrokes = () => {
    return signatureManager ? signatureManager.getStrokes() : null;
  };

  // --- PHOTO HANDLING ---
  const photoUpload = document.getElementById("photo-upload");
  const photoPreview = document.getElementById("photo-preview");
  const photoPlaceholder = document.getElementById("photo-placeholder");
  const clearPhotoBtn = document.getElementById("clear-photo");

  // Store photo data globally
  window.photoData = null;

  photoUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        window.photoData = dataUrl;

        photoPreview.src = dataUrl;
        photoPreview.style.display = "block";
        photoPlaceholder.style.display = "none";
      };
      reader.readAsDataURL(file);
    }
  });

  clearPhotoBtn.addEventListener("click", () => {
    window.photoData = null;
    photoUpload.value = "";
    photoPreview.src = "";
    photoPreview.style.display = "none";
    photoPlaceholder.style.display = "flex";
  });

  // Expose photo getter for TypeScript
  window.getPhotoData = () => window.photoData;

  // --- CSV HANDLING ---
  const csvFileInput = document.getElementById("csv-file");
  const csvTextArea = document.getElementById("csv-text");
  const parseCSVButton = document.getElementById("parse-csv");
  const clearCSVButton = document.getElementById("clear-csv");
  const csvPreview = document.getElementById("csv-preview");
  const csvPreviewTable = document.getElementById("csv-preview-table");
  const itemCountSpan = document.getElementById("item-count");
  const csvValidationMessage = document.getElementById("csv-validation-message");
  const generateButton = document.getElementById("generate-pdf");

  // Handle file upload
  csvFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        csvTextArea.value = event.target.result;
      };
      reader.readAsText(file);
    }
  });

  // Parse CSV button
  parseCSVButton.addEventListener("click", () => {
    const csvText = csvTextArea.value.trim();
    if (!csvText) {
      csvValidationMessage.textContent = "Please enter or upload CSV data first.";
      return;
    }

    csvValidationMessage.textContent = "";

    // Wait for TypeScript to be loaded
    if (typeof window.parseCSV !== "function") {
      csvValidationMessage.textContent =
        "PDF generation module not loaded yet. Please wait and try again.";
      return;
    }

    const items = window.parseCSV(csvText);

    if (items.length === 0) {
      csvValidationMessage.textContent =
        "No valid items found. Make sure CSV has headers: type, maker_name, maker_address, model, caliber, serial";
      csvPreview.style.display = "none";
      window.setParsedItems([]);
      updateGenerateButton();
      return;
    }

    // Store items globally
    window.setParsedItems(items);

    // Render preview table
    renderPreviewTable(items);

    // Update generate button
    updateGenerateButton();
  });

  // Render preview table
  function renderPreviewTable(items) {
    const tbody = csvPreviewTable.querySelector("tbody");
    tbody.innerHTML = "";

    let validCount = 0;

    items.forEach((item, index) => {
      const row = document.createElement("tr");
      if (!item.isValid) {
        row.classList.add("row-invalid");
      } else {
        validCount++;
      }

      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${escapeHtml(item.type)}</td>
        <td>${escapeHtml(item.maker_name)}</td>
        <td>${escapeHtml(item.model)}</td>
        <td>${escapeHtml(item.caliber)}</td>
        <td>${escapeHtml(item.serial)}</td>
        <td class="${item.isValid ? "status-valid" : "status-invalid"}">
          ${item.isValid ? "Valid" : escapeHtml(item.validationError)}
        </td>
      `;

      tbody.appendChild(row);
    });

    itemCountSpan.textContent = `${validCount} valid / ${items.length} total`;
    csvPreview.style.display = "block";

    if (validCount === 0) {
      csvValidationMessage.textContent = "No valid items. Please fix the errors shown above.";
    } else if (validCount < items.length) {
      csvValidationMessage.textContent = `${items.length - validCount} item(s) have errors and will be skipped.`;
    }
  }

  // Helper to escape HTML
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  // Clear CSV button
  clearCSVButton.addEventListener("click", () => {
    csvFileInput.value = "";
    csvTextArea.value = "";
    csvPreview.style.display = "none";
    csvValidationMessage.textContent = "";
    window.setParsedItems && window.setParsedItems([]);
    updateGenerateButton();
  });

  // Update generate button based on CSV items
  function updateGenerateButton() {
    const items = window.getParsedItems ? window.getParsedItems() : [];
    const validItems = items.filter((item) => item.isValid);

    if (validItems.length > 0) {
      generateButton.textContent = `GENERATE ${validItems.length} FORMS (ZIP)`;
      generateButton.classList.add("batch-mode");
    } else {
      generateButton.textContent = "GENERATE 5320.23";
      generateButton.classList.remove("batch-mode");
    }
  }

  // Generate PDF button
  document.getElementById("generate-pdf").addEventListener("click", async () => {
    const isFormValid = runAllValidations();
    if (!isFormValid) {
      alert("PLEASE FIX THE HIGHLIGHTED VALIDATION ERRORS BEFORE GENERATING THE PDF.");
      const firstInvalid = form.querySelector(".invalid-field");
      if (firstInvalid) {
        firstInvalid
          .closest(".question-group")
          .scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    // Check if we're in batch mode
    const items = window.getParsedItems ? window.getParsedItems() : [];
    const validItems = items.filter((item) => item.isValid);

    try {
      if (validItems.length > 0) {
        // Batch mode - generate ZIP
        if (typeof window.generateBatchPDF === "function") {
          generateButton.disabled = true;
          generateButton.textContent = "GENERATING...";
          await window.generateBatchPDF(validItems);
          generateButton.disabled = false;
          updateGenerateButton();
        } else {
          alert(
            "Batch PDF generation function not loaded. Please ensure the TypeScript module is properly loaded."
          );
        }
      } else {
        // Single mode - generate single PDF
        if (typeof window.generatePDF === "function") {
          await window.generatePDF();
        } else {
          alert(
            "PDF generation function not loaded. Please ensure the TypeScript module is properly loaded."
          );
        }
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert(`Error generating PDF: ${error instanceof Error ? error.message : String(error)}`);
      generateButton.disabled = false;
      updateGenerateButton();
    }
  });

  // --- INITIALIZATION ---
  const runAllUIUpdates = () => {
    syncAddress();
    updateQ6m2();
    updateUpinInput();
    updateQ9cInput();
    form.elements.q4a_firearmType.forEach((radio) => radio.dispatchEvent(new Event("change")));
    form.elements.q9a_citizenship.forEach((cb) => cb.dispatchEvent(new Event("change")));
    form.querySelectorAll("textarea").forEach(autoResizeTextarea);
    Object.keys(validations).forEach((fieldName) => validateField(form.elements[fieldName]));

    // Set certification date if it's empty
    const certDate = document.getElementById("certificationDate");
    if (!certDate.value) {
      certDate.value = getTodayYYYYMMDD();
    }

    // Normalize all existing text values to uppercase on initialization
    form
      .querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea')
      .forEach(normalizeToUppercase);
  };

  // Add blur listeners for validation
  Object.keys(validations).forEach((fieldName) => {
    const field = form.elements[fieldName];
    if (field) {
      field.addEventListener("blur", () => validateField(field));
    }
  });

  // --- REMEMBER ME INITIALIZATION (must run before loadStateFromStorage) ---
  const rememberCheckbox = document.getElementById("remember-me");
  if (rememberCheckbox) {
    // Sync checkbox UI to persisted preference BEFORE loading form data
    rememberCheckbox.checked = localStorage.getItem(REMEMBER_KEY) === "true";

    rememberCheckbox.addEventListener("change", () => {
      if (rememberCheckbox.checked) {
        localStorage.setItem(REMEMBER_KEY, "true");
        // Migrate current sessionStorage data to localStorage
        const data = sessionStorage.getItem(STORAGE_KEY);
        if (data) {
          localStorage.setItem(STORAGE_KEY, data);
          sessionStorage.removeItem(STORAGE_KEY);
        }
      } else {
        localStorage.removeItem(REMEMBER_KEY);
        // Migrate localStorage data to sessionStorage
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
          sessionStorage.setItem(STORAGE_KEY, data);
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    });
  }

  // --- INITIALIZATION ORDER (critical) ---
  loadStateFromStorage();
  applyPrefillConfig(); // Apply prefills to empty fields
  applyReadonlyLocks(); // Lock readonly fields
  lockRelatedOtherFields(); // Lock related "other" text inputs
  runAllUIUpdates();
});
