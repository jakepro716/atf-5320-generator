import * as mupdf from "mupdf";
import JSZip from "jszip";
import { Signature, Format } from "autopen";

// Special symbol to represent selected checkboxes/radio buttons
const SELECTED = Symbol("SELECTED");

// Valid firearm types (exact matches required)
const VALID_FIREARM_TYPES = [
  "ANY OTHER WEAPON",
  "DESTRUCTIVE DEVICE",
  "MACHINEGUN",
  "SHORT BARRELED RIFLE",
  "SHORT BARRELED SHOTGUN",
  "SILENCER",
] as const;

// Item data interface for batch processing
export interface ItemData {
  type: string;
  maker_name: string;
  maker_address: string;
  model: string;
  caliber: string;
  serial: string;
  isValid?: boolean;
  validationError?: string;
}

// Type declarations for global functions
declare global {
  interface Window {
    generatePDF: () => Promise<void>;
    generateBatchPDF: (items: ItemData[]) => Promise<void>;
    serializeForm: () => NFAFormData;
    parseCSV: (csvText: string) => ItemData[];
    validateItem: (item: ItemData) => ItemData;
    getParsedItems: () => ItemData[];
    setParsedItems: (items: ItemData[]) => void;
    getPhotoData: () => string | null;
    getSignatureStrokes: () => Array<Array<{ x: number; y: number }>> | null;
    photoData: string | null;
  }
}

// Form data interface matching the HTML form structure
export interface NFAFormData {
  // Question 1
  q1_formType?: string;

  // Question 2
  q2_fullName?: string;
  q2_address?: string;

  // Question 3
  q3a_fullName?: string;
  q3a_homeAddress?: string;
  q3a_sameAs2?: boolean;
  q3b_telephone?: string;
  q3c_email?: string;
  q3d_otherNames?: string;
  q3f_ssn?: string;
  q3g_dob?: string;
  q3h_ethnicity?: string;
  q3i_race?: string;

  // Question 4
  q4a_firearmType?: string;
  q4a_firearmType_other?: string;
  q4b_name?: string;
  q4b_address?: string;
  q4c_model?: string;
  q4d_caliber?: string;
  q4e_serial?: string;

  // Question 5
  q5_agencyName?: string;
  q5_officialName?: string;
  q5_officialTitle?: string;
  q5_address?: string;

  // Question 6 (prohibitors)
  q6a_intent?: string;
  q6b_sell?: string;
  q6c_indictment?: string;
  q6d_convicted?: string;
  q6e_fugitive?: string;
  q6f_user?: string;
  q6g_mental?: string;
  q6h_dishonorable?: string;
  q6i_restraining?: string;
  q6j_domestic?: string;
  q6k_renounced?: string;
  q6l_illegal?: string;
  q6m1_nonimmigrant?: string;
  q6m2_exception?: string;

  // Question 7
  q7_alienNumber?: string;

  // Question 8
  q8_hasUpin?: string;
  q8_upinNumber?: string;

  // Question 9
  q9a_citizenship?: string[] | string;
  q9a_citizenship_other?: string;
  q9b_birthState?: string;
  q9c_birthCountry?: string;
  q9c_birthCountry_other?: string;

  // Certification
  certificationDate?: string;

  // Signature
  signature?: Array<Array<{ x: number; y: number }>>;
}

// Function to get form data from HTML form
function getFormData(): NFAFormData {
  // Use the existing serializeForm function from the HTML page
  if (typeof window.serializeForm === "function") {
    return window.serializeForm();
  }

  // Fallback: basic form data extraction
  const form = document.getElementById("nfa-form") as HTMLFormElement;
  if (!form) {
    throw new Error("Form not found");
  }

  const formData = new FormData(form);
  const data: NFAFormData = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      (data as any)[key] = value.toUpperCase();
    }
  }

  return data;
}

// Helper function to ensure strings are uppercase
function normalizeString(value: string | undefined): string | undefined {
  return value ? value.toUpperCase() : value;
}

// Helper function to parse date strings as local dates to avoid timezone issues
function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
}

// Helper function to sanitize filename components
function sanitizeFilenameComponent(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^a-zA-Z0-9_.-]/g, "") // Keep only alphanumerics, underscores, hyphens, dots
    .replace(/_{2,}/g, "_") // Collapse multiple underscores
    .replace(/^[._-]+|[._-]+$/g, "") // Remove leading/trailing separators
    .substring(0, 50); // Limit length per component
}

// Helper function to generate base filename (without extension)
function generateBaseFilename(formData: NFAFormData): string {
  const components: string[] = ["5320.23"];

  // Add responsible person name
  if (formData.q3a_fullName) {
    components.push(sanitizeFilenameComponent(formData.q3a_fullName));
  }

  // Add firearm model
  if (formData.q4c_model) {
    components.push(sanitizeFilenameComponent(formData.q4c_model));
  }

  // Add firearm serial
  if (formData.q4e_serial) {
    components.push(sanitizeFilenameComponent(formData.q4e_serial));
  }

  // Add certification date
  const dateStr = formData.certificationDate
    ? formData.certificationDate
    : new Date().toISOString().split("T")[0];
  components.push(dateStr);

  return components.join("_");
}

// Function to map form data to PDF widget format
function mapFormDataToPdfFields(formData: NFAFormData): Map<string, string | typeof SELECTED> {
  const fieldsToFill = new Map<string, string | typeof SELECTED>();

  // Question 1 - Form Type
  if (formData.q1_formType) {
    const formTypeMapping: Record<string, string> = {
      "ATF FORM 1": "topmostSubform[0].Page1[0].form1[0]",
      "ATF FORM 4": "topmostSubform[0].Page1[0].form4[0]",
      "ATF FORM 5": "topmostSubform[0].Page1[0].form5[0]",
    };
    const widgetName = formTypeMapping[formData.q1_formType];
    if (widgetName) {
      fieldsToFill.set(widgetName, SELECTED);
    }
  }

  // Question 2 - Applicant/Transferee
  if (formData.q2_fullName || formData.q2_address) {
    const applicantInfo = [
      normalizeString(formData.q2_fullName) || "",
      normalizeString(formData.q2_address) || "",
    ]
      .filter((x) => x)
      .join("\n");

    if (applicantInfo) {
      fieldsToFill.set("topmostSubform[0].Page1[0].applicantaddress[0]", applicantInfo);
    }
  }

  // Question 3a - Responsible Person
  if (formData.q3a_fullName || formData.q3a_homeAddress || formData.q3a_sameAs2) {
    let homeAddress = normalizeString(formData.q3a_homeAddress) || "";

    // If "SAME AS 2" is checked and address field is empty, use address from Question 2
    if (formData.q3a_sameAs2 && !homeAddress && formData.q2_address) {
      homeAddress = normalizeString(formData.q2_address) || "";
    }

    const responsibleInfo = [normalizeString(formData.q3a_fullName) || "", homeAddress]
      .filter((x) => x)
      .join("\n");

    if (responsibleInfo) {
      fieldsToFill.set("topmostSubform[0].Page1[0].responsibleaddress[0]", responsibleInfo);
    }
  }

  // Question 3b - Telephone
  if (formData.q3b_telephone) {
    fieldsToFill.set(
      "topmostSubform[0].Page1[0].telephone[0]",
      normalizeString(formData.q3b_telephone)!
    );
  }

  // Question 3c - Email
  if (formData.q3c_email) {
    fieldsToFill.set("topmostSubform[0].Page1[0].email[0]", normalizeString(formData.q3c_email)!);
  }

  // Question 3d - Other Names
  if (formData.q3d_otherNames) {
    fieldsToFill.set(
      "topmostSubform[0].Page1[0].othernames[0]",
      normalizeString(formData.q3d_otherNames)!
    );
  }

  // Question 3f - SSN
  if (formData.q3f_ssn) {
    fieldsToFill.set("topmostSubform[0].Page1[0].ssn2f[0]", normalizeString(formData.q3f_ssn)!);
  }

  // Question 3g - Date of Birth
  if (formData.q3g_dob) {
    const date = parseLocalDate(formData.q3g_dob);
    const formattedDate = `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
    fieldsToFill.set("topmostSubform[0].Page1[0].#field[24]", formattedDate);
  }

  // Question 3h - Ethnicity
  if (formData.q3h_ethnicity) {
    const ethnicityMapping: Record<string, string> = {
      "HISPANIC OR LATINO": "topmostSubform[0].Page1[0].ehl[0]",
      "NOT HISPANIC OR LATINO": "topmostSubform[0].Page1[0].nhl[0]",
    };
    const widgetName = ethnicityMapping[formData.q3h_ethnicity];
    if (widgetName) {
      fieldsToFill.set(widgetName, SELECTED);
    }
  }

  // Question 3i - Race
  if (formData.q3i_race) {
    const raceMapping: Record<string, string> = {
      "AMERICAN INDIAN OR ALASKA NATIVE": "topmostSubform[0].Page1[0].aian[0]",
      ASIAN: "topmostSubform[0].Page1[0].a[0]",
      "BLACK OR AFRICAN AMERICAN": "topmostSubform[0].Page1[0].baa[0]",
      "NATIVE HAWAIIAN OR OTHER PACIFIC ISLANDER": "topmostSubform[0].Page1[0].nhopi[0]",
      WHITE: "topmostSubform[0].Page1[0].w[0]",
    };
    const widgetName = raceMapping[formData.q3i_race];
    if (widgetName) {
      fieldsToFill.set(widgetName, SELECTED);
    }
  }

  // Question 4a - Firearm Type
  if (formData.q4a_firearmType) {
    let firearmType = normalizeString(formData.q4a_firearmType);
    if (firearmType === "OTHER" && formData.q4a_firearmType_other) {
      firearmType = normalizeString(formData.q4a_firearmType_other);
    }
    if (firearmType) {
      fieldsToFill.set("topmostSubform[0].Page1[0].firearmtype[0]", firearmType);
    }
  }

  // Question 4b - Maker/Manufacturer
  if (formData.q4b_name || formData.q4b_address) {
    const makerInfo = [
      normalizeString(formData.q4b_name) || "",
      normalizeString(formData.q4b_address) || "",
    ]
      .filter((x) => x)
      .join("\n");

    if (makerInfo) {
      fieldsToFill.set("topmostSubform[0].Page1[0].importeraddress[0]", makerInfo);
    }
  }

  // Question 4c - Model
  if (formData.q4c_model) {
    fieldsToFill.set("topmostSubform[0].Page1[0].Model[0]", normalizeString(formData.q4c_model)!);
  }

  // Question 4d - Caliber
  if (formData.q4d_caliber) {
    fieldsToFill.set(
      "topmostSubform[0].Page1[0].caliber[0]",
      normalizeString(formData.q4d_caliber)!
    );
  }

  // Question 4e - Serial Number
  if (formData.q4e_serial) {
    fieldsToFill.set("topmostSubform[0].Page1[0].serial[0]", normalizeString(formData.q4e_serial)!);
  }

  // Question 5 - Law Enforcement
  const leoInfo = [
    normalizeString(formData.q5_agencyName) || "",
    formData.q5_officialName
      ? `${normalizeString(formData.q5_officialName)}${formData.q5_officialTitle ? ", " + normalizeString(formData.q5_officialTitle) : ""}`
      : "",
    normalizeString(formData.q5_address) || "",
  ].filter((x) => x);

  if (leoInfo.length > 0) {
    fieldsToFill.set("topmostSubform[0].Page1[0].TextField3[0]", leoInfo[0] || "");
    if (leoInfo[1]) fieldsToFill.set("topmostSubform[0].Page1[0].TextField4[0]", leoInfo[1]);
    if (leoInfo[2]) fieldsToFill.set("topmostSubform[0].Page1[0].TextField5[0]", leoInfo[2]);
  }

  // Question 6 - Prohibitors
  const prohibitorMapping: Record<string, [string, string]> = {
    q6a_intent: [
      "topmostSubform[0].Page2[0].CheckBoxYes6a[0]",
      "topmostSubform[0].Page2[0].CheckBoxno6a[0]",
    ],
    q6b_sell: [
      "topmostSubform[0].Page2[0].CheckBoxYes6b[0]",
      "topmostSubform[0].Page2[0].CheckBoxno6b[0]",
    ],
    q6c_indictment: [
      "topmostSubform[0].Page2[0].CheckBoxYes1[0]",
      "topmostSubform[0].Page2[0].CheckBoxno1[0]",
    ],
    q6d_convicted: [
      "topmostSubform[0].Page2[0].CheckBoxYes2[0]",
      "topmostSubform[0].Page2[0].CheckBoxno2[0]",
    ],
    q6e_fugitive: [
      "topmostSubform[0].Page2[0].CheckBoxYes3[0]",
      "topmostSubform[0].Page2[0].CheckBoxno3[0]",
    ],
    q6f_user: [
      "topmostSubform[0].Page2[0].CheckBoxYes4[0]",
      "topmostSubform[0].Page2[0].CheckBoxno4[0]",
    ],
    q6g_mental: [
      "topmostSubform[0].Page2[0].CheckBoxYes5[0]",
      "topmostSubform[0].Page2[0].CheckBoxno5[0]",
    ],
    q6h_dishonorable: [
      "topmostSubform[0].Page2[0].CheckBoxYes6[0]",
      "topmostSubform[0].Page2[0].CheckBoxno6[0]",
    ],
    q6i_restraining: [
      "topmostSubform[0].Page2[0].CheckBoxYes7[0]",
      "topmostSubform[0].Page2[0].CheckBoxno7[0]",
    ],
    q6j_domestic: [
      "topmostSubform[0].Page2[0].CheckBoxYes8[0]",
      "topmostSubform[0].Page2[0].CheckBoxno8[0]",
    ],
    q6k_renounced: [
      "topmostSubform[0].Page2[0].CheckBoxYes9[0]",
      "topmostSubform[0].Page2[0].CheckBoxno9[0]",
    ],
    q6l_illegal: [
      "topmostSubform[0].Page2[0].CheckBoxYes10[0]",
      "topmostSubform[0].Page2[0].CheckBoxno10[0]",
    ],
    q6m1_nonimmigrant: [
      "topmostSubform[0].Page2[0].CheckBoxYes11[0]",
      "topmostSubform[0].Page2[0].CheckBoxno11[0]",
    ],
  };

  for (const [formField, [yesWidget, noWidget]] of Object.entries(prohibitorMapping)) {
    const value = formData[formField as keyof NFAFormData];
    if (value === "YES") {
      fieldsToFill.set(yesWidget, SELECTED);
    } else if (value === "NO") {
      fieldsToFill.set(noWidget, SELECTED);
    }
  }

  // Question 6m2 - Special handling for N/A option
  if (formData.q6m2_exception) {
    if (formData.q6m2_exception === "N/A") {
      fieldsToFill.set("topmostSubform[0].Page2[0].CheckBoxNA[0]", SELECTED);
    } else if (formData.q6m2_exception === "YES") {
      fieldsToFill.set("topmostSubform[0].Page2[0].CheckBoxYes12[0]", SELECTED);
    } else if (formData.q6m2_exception === "NO") {
      fieldsToFill.set("topmostSubform[0].Page2[0].CheckBoxno12[0]", SELECTED);
    }
  }

  // Question 7 - Alien Number
  if (formData.q7_alienNumber) {
    fieldsToFill.set(
      "topmostSubform[0].Page2[0].TextFieldalien[0]",
      normalizeString(formData.q7_alienNumber)!
    );
  }

  // Question 8 - UPIN
  if (formData.q8_hasUpin) {
    if (formData.q8_hasUpin === "YES") {
      fieldsToFill.set("topmostSubform[0].Page2[0].yes17[0]", SELECTED);
      if (formData.q8_upinNumber) {
        fieldsToFill.set(
          "topmostSubform[0].Page2[0].please17[0]",
          normalizeString(formData.q8_upinNumber)!
        );
      }
    } else if (formData.q8_hasUpin === "NO") {
      fieldsToFill.set("topmostSubform[0].Page2[0].no17[0]", SELECTED);
    }
  }

  // Question 9a - Citizenship
  if (formData.q9a_citizenship) {
    const citizenship = Array.isArray(formData.q9a_citizenship)
      ? formData.q9a_citizenship
      : [formData.q9a_citizenship];
    if (citizenship.includes("USA")) {
      fieldsToFill.set("topmostSubform[0].Page2[0].usacheckbox[0]", SELECTED);
    }
    if (citizenship.includes("OTHER") && formData.q9a_citizenship_other) {
      fieldsToFill.set("topmostSubform[0].Page2[0].othercountrycheckbox[0]", SELECTED);
      fieldsToFill.set(
        "topmostSubform[0].Page2[0].Othercountry[0]",
        normalizeString(formData.q9a_citizenship_other)!
      );
    }
  }

  // Question 9b - State of Birth
  if (formData.q9b_birthState) {
    fieldsToFill.set(
      "topmostSubform[0].Page2[0].statebirth[0]",
      normalizeString(formData.q9b_birthState)!
    );
  }

  // Question 9c - Country of Birth
  if (formData.q9c_birthCountry) {
    if (formData.q9c_birthCountry === "USA") {
      fieldsToFill.set("topmostSubform[0].Page2[0].statecountry[0]", "UNITED STATES OF AMERICA");
    } else if (formData.q9c_birthCountry === "OTHER" && formData.q9c_birthCountry_other) {
      fieldsToFill.set(
        "topmostSubform[0].Page2[0].statecountry[0]",
        normalizeString(formData.q9c_birthCountry_other)!
      );
    }
  }

  // Certification Date
  if (formData.certificationDate) {
    const date = parseLocalDate(formData.certificationDate);
    const formattedDate = `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
    fieldsToFill.set("topmostSubform[0].Page2[0].DateField9[0]", formattedDate);
  } else {
    // Default to today's date
    const currentDate = new Date();
    const formattedDate = `${String(currentDate.getMonth() + 1).padStart(2, "0")}/${String(currentDate.getDate()).padStart(2, "0")}/${currentDate.getFullYear()}`;
    fieldsToFill.set("topmostSubform[0].Page2[0].DateField9[0]", formattedDate);
  }

  return fieldsToFill;
}

// Helper function to get CLEO widget variant names
function getCleoWidgetVariant(name: string): string {
  return name
    .replace("Page1[0]", "Page5[0]")
    .replace("Page2[0]", "Page6[0]")
    .replace("#field[24]", "#field[22]");
}

// Helper to render signature strokes to a JPEG image via autopen + OffscreenCanvas
async function renderSignatureImage(
  strokes: Array<Array<{ x: number; y: number }>>
): Promise<mupdf.Image | null> {
  try {
    const sig = new Signature({ canvasWidth: 600, canvasHeight: 200 });
    for (const stroke of strokes) {
      sig.pushStroke(stroke);
    }

    if (sig.isEmpty()) {
      console.log("[PDF] Signature is empty after pushing strokes");
      return null;
    }

    console.log("[PDF] Rendering signature SVG, stroke count:", sig.strokeCount);
    // Render to SVG
    const svgString = sig.render(Format.SVG, {
      width: 1200,
      height: 400,
      strokeWidth: 3,
      strokeColor: "#000000",
      spline: true,
      backgroundColor: null,
      contentFit: false,
    });

    // Rasterize SVG to JPEG using OffscreenCanvas
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = svgUrl;
    });

    const canvas = new OffscreenCanvas(1200, 400);
    const ctx = canvas.getContext("2d")!;

    // Fill white background (JPEG has no transparency)
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 1200, 400);

    // Draw SVG image
    ctx.drawImage(img, 0, 0, 1200, 400);

    URL.revokeObjectURL(svgUrl);

    // Convert to JPEG
    const jpegBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    const jpegBuffer = new Uint8Array(await jpegBlob.arrayBuffer());
    console.log("[PDF] Signature JPEG size:", jpegBuffer.length, "bytes");

    return new mupdf.Image(jpegBuffer);
  } catch (error) {
    console.error("Error rendering signature image:", error);
    return null;
  }
}

// Helper to render specific pages from a doc into a PDF buffer
function renderPagesToBuffer(
  doc: mupdf.PDFDocument,
  pageIndices: number[],
  photoImage: mupdf.Image | null,
  signatureImage: mupdf.Image | null,
  photoPageIndex: number,
  signaturePageIndex: number,
  signatureRect: mupdf.Rect | null
): Uint8Array {
  const outputBuffer = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(outputBuffer, "pdf", "");

  console.log("[PDF] renderPagesToBuffer: pages", pageIndices, "photoPage:", photoPageIndex, "sigPage:", signaturePageIndex, "hasPhoto:", !!photoImage, "hasSig:", !!signatureImage, "sigRect:", signatureRect);

  for (const pageIndex of pageIndices) {
    const page = doc.loadPage(pageIndex);
    const bounds = page.getBounds();
    const device = writer.beginPage(bounds);

    // Render the filled form page
    page.run(device, mupdf.Matrix.identity);

    // Draw photo on the first page of each copy
    if (photoImage && pageIndex === photoPageIndex) {
      try {
        const photoWidth = 144; // 2 inches at 72 DPI
        const photoHeight = 144;
        const photoX = 460;
        const photoY = 300;
        const matrix: mupdf.Matrix = [photoWidth, 0, 0, photoHeight, photoX, photoY];
        device.fillImage(photoImage, matrix, 1.0);
        console.log("[PDF] Drew photo on page", pageIndex);
      } catch (error) {
        console.error("Error drawing photo:", error);
      }
    }

    // Draw signature on the second page of each copy using captured widget rect
    if (signatureImage && pageIndex === signaturePageIndex && signatureRect) {
      try {
        // Signature image is 1200x400 (3:1 aspect ratio).
        // The widget rect is a thin line field — use its width but compute
        // height from the image aspect ratio to avoid distortion.
        const sigImageAspect = 1200 / 400; // 3:1
        const rectWidth = signatureRect[2] - signatureRect[0];
        const sigWidth = rectWidth;
        const sigHeight = sigWidth / sigImageAspect;
        // Bottom-align: signature sits on the widget's bottom edge (the line)
        const sigX = signatureRect[0];
        const sigY = signatureRect[3] - sigHeight;
        const matrix: mupdf.Matrix = [sigWidth, 0, 0, sigHeight, sigX, sigY];
        device.fillImage(signatureImage, matrix, 1.0);
        console.log("[PDF] Drew signature on page", pageIndex, "rect:", [sigX, sigY, sigWidth, sigHeight]);
      } catch (error) {
        console.error("Error drawing signature:", error);
      }
    }

    writer.endPage();
  }

  writer.close();
  return outputBuffer.asUint8Array().slice();
}

// Helper to trigger a file download
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Shared logic: load PDF, fill fields, delete instruction pages, prepare images
async function preparePdfDocument(
  fieldsToFill: Map<string, string | typeof SELECTED>
): Promise<{
  doc: mupdf.PDFDocument;
  photoImage: mupdf.Image | null;
  signatureImage: mupdf.Image | null;
  signatureRects: Map<number, mupdf.Rect>;
}> {
  const response = await fetch(
    "./static/f_5320.23_national_firearms_act_nfa_responsible_person_questionnaire.pdf"
  );

  if (!response.ok) {
    throw new Error(`Failed to load PDF: ${response.statusText}`);
  }

  const pdfBytes = await response.arrayBuffer();

  const doc = mupdf.Document.openDocument(
    new Uint8Array(pdfBytes),
    "application/pdf"
  ) as mupdf.PDFDocument;

  if (!doc.isPDF()) {
    throw new Error("Downloaded file is not a valid PDF");
  }

  // Collect widgets and remove signature fields
  const widgets = new Map<string, mupdf.PDFWidget>();
  const pageCount = doc.countPages();
  const signatureWidgetsToRemove: Array<{ page: mupdf.PDFPage; widget: mupdf.PDFWidget }> = [];

  // Map from page index to signature widget rect (captured before deletion)
  const signatureRects = new Map<number, mupdf.Rect>();

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = doc.loadPage(pageIndex) as mupdf.PDFPage;
    const pageWidgets = page.getWidgets();

    for (const widget of pageWidgets) {
      const fieldName = widget.getName() || "";
      const fieldType = widget.getFieldType();

      const isSignatureField =
        fieldType.toLowerCase().includes("signature") ||
        fieldType.toLowerCase().includes("sig") ||
        fieldName.toLowerCase().includes("signature") ||
        fieldName.toLowerCase().includes("_sig");

      if (isSignatureField) {
        // Capture the rect before we delete the widget
        const rect = widget.getRect();
        console.log(`[PDF] Signature widget on page ${pageIndex}: ${fieldName} rect=[${rect}]`);
        signatureRects.set(pageIndex, rect);
        signatureWidgetsToRemove.push({ page, widget });
      } else if (fieldName) {
        widgets.set(fieldName, widget);
      }
    }
  }

  for (const { page, widget } of signatureWidgetsToRemove) {
    try {
      page.deleteAnnotation(widget);
    } catch (error) {
      console.warn("Could not remove signature widget:", error);
    }
  }

  // Apply alignment changes
  const alignmentChanges: Array<[string, [number, number, number, number]]> = [
    ["topmostSubform[0].Page2[0].no17[0]", [2.5, 0, 2.5, 0]],
    ["topmostSubform[0].Page2[0].usacheckbox[0]", [1.5, 0, 1.5, 0]],
    ["topmostSubform[0].Page1[0].nhl[0]", [1, 0, 1, 0]],
    ["topmostSubform[0].Page1[0].w[0]", [1, 0, 1, 0]],
    ["topmostSubform[0].Page1[0].#field[24]", [0, -0.5, 0, 0.5]],
  ];

  for (const [widgetName, rectDeltas] of alignmentChanges) {
    for (const widgetNameVariant of [widgetName, getCleoWidgetVariant(widgetName)]) {
      const widget = widgets.get(widgetNameVariant);
      if (widget) {
        const currentRect = widget.getRect();
        const newRect: mupdf.Rect = [
          currentRect[0] + rectDeltas[0],
          currentRect[1] + rectDeltas[1],
          currentRect[2] + rectDeltas[2],
          currentRect[3] + rectDeltas[3],
        ];
        widget.setRect(newRect);
        widget.update();
      }
    }
  }

  // Fill form fields
  for (const [widgetName, answer] of fieldsToFill) {
    for (const widgetNameVariant of [widgetName, getCleoWidgetVariant(widgetName)]) {
      const widget = widgets.get(widgetNameVariant);
      if (widget) {
        try {
          if (answer === SELECTED) {
            if (widget.isCheckbox() || widget.isRadioButton()) {
              widget.toggle();
            }
          } else {
            const stringValue = answer as string;
            if (widget.isText()) {
              widget.setTextValue(stringValue);
            } else if (widget.isChoice()) {
              widget.setChoiceValue(stringValue);
            } else {
              try {
                widget.setTextValue(stringValue);
              } catch {
                // Ignore errors for unknown widget types
              }
            }
          }
          widget.update();
        } catch (error) {
          console.error(`Error filling widget ${widgetNameVariant}:`, error);
        }
      }
    }
  }

  // Delete instruction pages (pages 2-3) in reverse order
  try {
    doc.deletePage(3);
    doc.deletePage(2);
  } catch (error) {
    console.error("Error deleting pages:", error);
  }

  // Load photo image — convert to JPEG first since mupdf can't handle all formats (e.g. WebP)
  const photoDataUrl = window.getPhotoData ? window.getPhotoData() : null;
  let photoImage: mupdf.Image | null = null;

  console.log("[PDF] Photo data URL present:", !!photoDataUrl);
  if (photoDataUrl) {
    try {
      // Convert data URL to Blob without fetch (avoids CSP connect-src restrictions)
      const base64Data = photoDataUrl.split(",")[1];
      const mimeMatch = photoDataUrl.match(/^data:([^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      const binaryString = atob(base64Data);
      const rawBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        rawBytes[i] = binaryString.charCodeAt(i);
      }
      const photoBlob = new Blob([rawBytes], { type: mimeType });

      // Use createImageBitmap (works with any format including WebP, not subject to CSP)
      const bitmap = await createImageBitmap(photoBlob);

      // Draw onto OffscreenCanvas and export as JPEG for mupdf compatibility
      const photoCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const photoCtx = photoCanvas.getContext("2d")!;
      photoCtx.fillStyle = "#FFFFFF";
      photoCtx.fillRect(0, 0, bitmap.width, bitmap.height);
      photoCtx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const jpegBlob = await photoCanvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

      photoImage = new mupdf.Image(jpegBytes);
      console.log("[PDF] Photo converted to JPEG, size:", jpegBytes.length);
    } catch (error) {
      console.error("Error loading photo:", error);
    }
  }

  // Load signature image
  const signatureStrokes = window.getSignatureStrokes ? window.getSignatureStrokes() : null;
  let signatureImage: mupdf.Image | null = null;

  console.log("[PDF] Signature strokes present:", !!signatureStrokes, "count:", signatureStrokes?.length ?? 0);
  if (signatureStrokes && signatureStrokes.length > 0) {
    signatureImage = await renderSignatureImage(signatureStrokes);
    console.log("[PDF] Signature image created:", !!signatureImage);
  }

  console.log("[PDF] Final state - photoImage:", !!photoImage, "signatureImage:", !!signatureImage, "signatureRects:", signatureRects.size);
  return { doc, photoImage, signatureImage, signatureRects };
}

// Main PDF generation function
async function generatePDF(): Promise<void> {
  try {
    console.log("Extracting form data...");
    const formData = getFormData();
    const fieldsToFill = mapFormDataToPdfFields(formData);

    console.log("Loading and filling PDF...");
    const { doc, photoImage, signatureImage, signatureRects } = await preparePdfDocument(fieldsToFill);

    // After page deletion, 4 remaining pages:
    // Pages 0-1 = ATF/RP copy, Pages 2-3 = CLEO copy
    // Signature rects were captured at original page indices (1 for RP, 5 for CLEO)
    // After deleting pages 2-3: original page 1 → post-deletion page 1, original page 5 → post-deletion page 3
    const rpSigRect = signatureRects.get(1) || null;
    const cleoSigRect = signatureRects.get(5) || null;
    console.log("[PDF] RP signature rect:", rpSigRect, "CLEO signature rect:", cleoSigRect);

    const baseFilename = generateBaseFilename(formData);

    const atfBuffer = renderPagesToBuffer(doc, [0, 1], photoImage, signatureImage, 0, 1, rpSigRect);
    const cleoBuffer = renderPagesToBuffer(doc, [2, 3], photoImage, signatureImage, 2, 3, cleoSigRect);

    doc.destroy();

    // Package both PDFs into a ZIP
    const zip = new JSZip();
    zip.file(baseFilename + "_ATF.pdf", atfBuffer);
    zip.file(baseFilename + "_CLEO.pdf", cleoBuffer);

    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(zipBlob, baseFilename + ".zip");

    console.log("PDF generated and download initiated successfully!");
  } catch (error) {
    console.error("Error generating PDF:", error);
    alert(`Error generating PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Store for parsed items
let parsedItems: ItemData[] = [];

// CSV Parsing function
function parseCSV(csvText: string): ItemData[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) {
    return [];
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map((h) => h.toLowerCase().trim());

  // Expected columns
  const requiredColumns = ["type", "maker_name", "maker_address", "model", "caliber", "serial"];
  const columnIndices: Record<string, number> = {};

  for (const col of requiredColumns) {
    const index = headers.indexOf(col);
    if (index === -1) {
      console.error(`Missing required column: ${col}`);
      return [];
    }
    columnIndices[col] = index;
  }

  // Parse data rows
  const items: ItemData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const item: ItemData = {
      type: (values[columnIndices["type"]] || "").toUpperCase().trim(),
      maker_name: (values[columnIndices["maker_name"]] || "").toUpperCase().trim(),
      maker_address: (values[columnIndices["maker_address"]] || "").toUpperCase().trim(),
      model: (values[columnIndices["model"]] || "").toUpperCase().trim(),
      caliber: (values[columnIndices["caliber"]] || "").toUpperCase().trim(),
      serial: (values[columnIndices["serial"]] || "").toUpperCase().trim(),
    };

    items.push(validateItem(item));
  }

  return items;
}

// Parse a single CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// Validate a single item
function validateItem(item: ItemData): ItemData {
  const errors: string[] = [];

  // Check firearm type
  if (!item.type) {
    errors.push("Type is required");
  } else if (!VALID_FIREARM_TYPES.includes(item.type as typeof VALID_FIREARM_TYPES[number])) {
    errors.push(`Invalid type: "${item.type}"`);
  }

  // Check required fields
  if (!item.model) errors.push("Model is required");
  if (!item.serial) errors.push("Serial is required");

  item.isValid = errors.length === 0;
  item.validationError = errors.join("; ");

  return item;
}

// Generate ATF + CLEO PDF buffers for an item (internal use)
async function generatePDFBuffers(
  formData: NFAFormData,
  item?: ItemData
): Promise<{ atfBuffer: Uint8Array; cleoBuffer: Uint8Array; baseFilename: string }> {
  // If item is provided, override Question 4 fields
  const effectiveFormData = { ...formData };
  if (item) {
    effectiveFormData.q4a_firearmType = item.type;
    effectiveFormData.q4a_firearmType_other = undefined;
    effectiveFormData.q4b_name = item.maker_name;
    effectiveFormData.q4b_address = item.maker_address;
    effectiveFormData.q4c_model = item.model;
    effectiveFormData.q4d_caliber = item.caliber;
    effectiveFormData.q4e_serial = item.serial;
  }

  const fieldsToFill = mapFormDataToPdfFields(effectiveFormData);

  const { doc, photoImage, signatureImage, signatureRects } = await preparePdfDocument(fieldsToFill);

  // After page deletion, 4 remaining pages:
  // Pages 0-1 = ATF/RP copy, Pages 2-3 = CLEO copy
  const rpSigRect = signatureRects.get(1) || null;
  const cleoSigRect = signatureRects.get(5) || null;
  const atfBuffer = renderPagesToBuffer(doc, [0, 1], photoImage, signatureImage, 0, 1, rpSigRect);
  const cleoBuffer = renderPagesToBuffer(doc, [2, 3], photoImage, signatureImage, 2, 3, cleoSigRect);

  const baseFilename = generateBaseFilename(effectiveFormData);

  doc.destroy();

  return { atfBuffer, cleoBuffer, baseFilename };
}

// Batch PDF generation function
async function generateBatchPDF(items: ItemData[]): Promise<void> {
  try {
    console.log(`Generating batch PDFs for ${items.length} items...`);

    const validItems = items.filter((item) => item.isValid);
    if (validItems.length === 0) {
      throw new Error("No valid items to process");
    }

    const formData = getFormData();
    const zip = new JSZip();

    let completed = 0;
    const total = validItems.length;

    for (const item of validItems) {
      console.log(`Processing item ${completed + 1}/${total}: ${item.model} - ${item.serial}`);

      const { atfBuffer, cleoBuffer, baseFilename } = await generatePDFBuffers(formData, item);
      zip.file(baseFilename + "_ATF.pdf", atfBuffer);
      zip.file(baseFilename + "_CLEO.pdf", cleoBuffer);

      completed++;
    }

    console.log("Creating ZIP file...");
    const zipBlob = await zip.generateAsync({ type: "blob" });

    // Generate ZIP filename
    const zipFilename = generateBatchZipFilename(formData);

    downloadBlob(zipBlob, zipFilename);

    console.log(`Batch PDF generation complete! Downloaded ${zipFilename}`);
  } catch (error) {
    console.error("Error generating batch PDFs:", error);
    alert(`Error generating batch PDFs: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Generate batch ZIP filename
function generateBatchZipFilename(formData: NFAFormData): string {
  const components: string[] = ["5320.23-forms"];

  if (formData.q3a_fullName) {
    components.push(sanitizeFilenameComponent(formData.q3a_fullName));
  }

  const dateStr = formData.certificationDate
    ? formData.certificationDate
    : new Date().toISOString().split("T")[0];
  components.push(dateStr);

  return components.join("_") + ".zip";
}

// Initialize mupdf and set up the interface
console.log("Initializing mupdf...");
console.log("mupdf loaded successfully");

// Make functions available globally
window.generatePDF = generatePDF;
window.generateBatchPDF = generateBatchPDF;
window.parseCSV = parseCSV;
window.validateItem = validateItem;
window.getParsedItems = () => parsedItems;
window.setParsedItems = (items: ItemData[]) => {
  parsedItems = items;
};

console.log("PDF generation functions are ready. The form can now generate PDFs.");
