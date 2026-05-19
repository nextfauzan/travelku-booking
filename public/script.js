"use strict";

const API_BASE_URL =
  window.location.protocol === "file:" ? "http://localhost:3000/api" : "/api";

const FIELD_NAMES = {
  id: "id",
  name: "customer_name",
  contact: "contact",
  packageId: "package_id",
  package: "package_name",
  date: "departure_date",
  guests: "participants",
  price: "price_per_person",
  status: "status",
  notes: "note",
};

const FIELD_ALIASES = {
  id: ["id", "booking_id"],
  name: ["nama_pemesan", "nama", "customer_name", "name"],
  contact: ["contact", "kontak", "email", "customer_email", "no_hp", "phone", "customer_phone"],
  packageId: ["package_id", "packageId"],
  package: ["paket", "nama_paket", "paket_wisata", "package_name"],
  date: ["tanggal_booking", "tanggal", "tanggal_perjalanan", "tanggal_keberangkatan", "departure_date", "travel_date"],
  guests: ["jumlah_peserta", "jumlah_orang", "peserta", "participants", "guest_count"],
  price: ["total_harga", "harga", "harga_paket", "estimasi_harga", "price_per_person", "total_price", "estimated_price"],
  status: ["status"],
  notes: ["catatan", "notes", "keterangan", "note"],
  createdAt: ["created_at", "createdAt"],
};

const STATUS_TRANSITIONS = {
  Menunggu: ["Dikonfirmasi", "Dibatalkan"],
  Dikonfirmasi: ["Selesai", "Dibatalkan"],
  Selesai: [],
  Dibatalkan: [],
};

const state = {
  bookings: [],
  packages: [],
  editingId: null,
  isLoading: false,
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  },
};

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  form: document.getElementById("bookingForm"),
  formTitle: document.getElementById("formTitle"),
  submitButton: document.getElementById("submitButton"),
  resetButton: document.getElementById("resetButton"),
  cancelEditButton: document.getElementById("cancelEditButton"),
  refreshButton: document.getElementById("refreshButton"),
  exportButton: document.getElementById("exportButton"),
  messageBox: document.getElementById("messageBox"),
  tableBody: document.getElementById("bookingTableBody"),
  rowTemplate: document.getElementById("bookingRowTemplate"),
  summaryTotal: document.getElementById("summaryTotal"),
  summaryPending: document.getElementById("summaryPending"),
  summaryConfirmed: document.getElementById("summaryConfirmed"),
  summaryRevenue: document.getElementById("summaryRevenue"),
  filterSearch: document.getElementById("filterSearch"),
  filterStatus: document.getElementById("filterStatus"),
  filterPackage: document.getElementById("filterPackage"),
  filterStartDate: document.getElementById("filterStartDate"),
  filterEndDate: document.getElementById("filterEndDate"),
  clearFilterButton: document.getElementById("clearFilterButton"),
  paginationSummary: document.getElementById("paginationSummary"),
  pageSize: document.getElementById("pageSize"),
  prevPageButton: document.getElementById("prevPageButton"),
  nextPageButton: document.getElementById("nextPageButton"),
  pageIndicator: document.getElementById("pageIndicator"),
  inputs: {
    id: document.getElementById("bookingId"),
    name: document.getElementById("customerName"),
    email: document.getElementById("customerEmail"),
    phone: document.getElementById("customerPhone"),
    package: document.getElementById("packageSelect"),
    date: document.getElementById("bookingDate"),
    guests: document.getElementById("guestCount"),
    price: document.getElementById("estimatedPrice"),
    notes: document.getElementById("notes"),
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  setDefaultDate();
  await loadPackages();
  await loadBookings();
});

function bindEvents() {
  elements.form.addEventListener("submit", handleSubmit);
  elements.resetButton.addEventListener("click", resetForm);
  elements.cancelEditButton.addEventListener("click", resetForm);
  elements.refreshButton.addEventListener("click", loadBookings);
  elements.exportButton.addEventListener("click", exportBookings);
  elements.clearFilterButton.addEventListener("click", clearFilters);
  elements.inputs.package.addEventListener("change", handlePackageChange);
  elements.filterSearch.addEventListener("input", debounce(resetPageAndLoad, 260));
  elements.filterStatus.addEventListener("change", resetPageAndLoad);
  elements.filterPackage.addEventListener("input", debounce(resetPageAndLoad, 260));
  elements.filterStartDate.addEventListener("change", resetPageAndLoad);
  elements.filterEndDate.addEventListener("change", resetPageAndLoad);
  elements.pageSize.addEventListener("change", () => {
    state.pagination.limit = Number(elements.pageSize.value);
    resetPageAndLoad();
  });
  elements.prevPageButton.addEventListener("click", () => {
    if (state.pagination.page > 1) {
      state.pagination.page -= 1;
      loadBookings();
    }
  });
  elements.nextPageButton.addEventListener("click", () => {
    if (state.pagination.page < state.pagination.totalPages) {
      state.pagination.page += 1;
      loadBookings();
    }
  });
  elements.tableBody.addEventListener("click", handleTableClick);
  elements.tableBody.addEventListener("change", handleTableChange);
}

async function loadPackages() {
  try {
    const response = await apiRequest("/packages");
    state.packages = extractPackages(response);
    renderPackageOptions();
  } catch (error) {
    showMessage(error.message || "Gagal memuat paket wisata.", "error");
  }
}

function renderPackageOptions() {
  const selectedValue = elements.inputs.package.value;
  elements.inputs.package.replaceChildren(createOption("", "Pilih paket"));

  state.packages.forEach((packageItem) => {
    const label = `${packageItem.name} - kuota ${numberFormat(packageItem.capacity)}`;
    elements.inputs.package.appendChild(createOption(String(packageItem.id), label));
  });

  elements.inputs.package.value = selectedValue;
}

async function loadBookings() {
  setLoading(true);
  hideMessage();

  try {
    const query = buildFilterQuery({ includePagination: true });
    const response = await apiRequest(`/bookings${query}`);
    state.bookings = extractBookings(response).map(normalizeBooking);
    state.pagination = extractPagination(response, state.pagination);

    renderBookings(state.bookings);
    renderPagination();
    await loadSummary();
    setApiStatus(true, "API terhubung");
  } catch (error) {
    setApiStatus(false, "API tidak terhubung");
    showMessage(error.message || "Gagal memuat data booking.", "error");
    state.bookings = [];
    renderBookings([]);
    renderComputedSummary([]);
    renderPagination();
  } finally {
    setLoading(false);
  }
}

async function loadSummary() {
  try {
    const query = buildFilterQuery({ includePagination: false });
    const response = await apiRequest(`/summary${query}`);
    const summary = extractSummary(response);

    if (!summary) {
      renderComputedSummary(state.bookings);
      return;
    }

    elements.summaryTotal.textContent = numberFormat(summary.total_bookings ?? summary.total_booking ?? summary.total ?? 0);
    elements.summaryPending.textContent = numberFormat(summary.pending ?? summary.total_pending ?? 0);
    elements.summaryConfirmed.textContent = numberFormat(summary.confirmed ?? summary.total_confirmed ?? 0);
    elements.summaryRevenue.textContent = currencyFormat(
      summary.total_estimated_revenue ?? summary.estimasi_pendapatan ?? summary.total_pendapatan ?? summary.revenue ?? 0,
    );
  } catch {
    renderComputedSummary(state.bookings);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  hideMessage();
  clearValidationErrors();

  const validationErrors = validateForm();
  if (validationErrors.length > 0) {
    showValidationErrors(validationErrors);
    return;
  }

  const payload = buildPayloadFromForm();
  const isEditing = Boolean(state.editingId);

  setFormBusy(true);

  try {
    if (isEditing) {
      await apiRequest(`/bookings/${encodeURIComponent(state.editingId)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showMessage("Booking berhasil diperbarui.", "success");
    } else {
      await apiRequest("/bookings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showMessage("Booking berhasil ditambahkan.", "success");
    }

    resetForm();
    await loadBookings();
  } catch (error) {
    showMessage(error.message || "Gagal menyimpan booking.", "error");
  } finally {
    setFormBusy(false);
  }
}

function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const row = button.closest("tr");
  const id = row?.dataset.id;
  const booking = findBookingById(id);
  if (!booking) return;

  if (button.dataset.action === "edit") {
    startEdit(booking);
    return;
  }

  if (button.dataset.action === "delete") {
    deleteBooking(booking);
  }
}

async function handleTableChange(event) {
  const select = event.target.closest("select[data-action='status']");
  if (!select) return;

  const row = select.closest("tr");
  const id = row?.dataset.id;
  const booking = findBookingById(id);
  if (!booking) return;

  const previousStatus = booking.status;
  const nextStatus = select.value;
  if (previousStatus === nextStatus) return;

  select.disabled = true;
  hideMessage();

  try {
    await apiRequest(`/bookings/${encodeURIComponent(booking.id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ [FIELD_NAMES.status]: nextStatus, status: nextStatus }),
    });
    showMessage("Status booking berhasil diperbarui.", "success");
    await loadBookings();
  } catch (error) {
    select.value = previousStatus;
    showMessage(error.message || "Gagal mengubah status booking.", "error");
  } finally {
    select.disabled = false;
  }
}

async function deleteBooking(booking) {
  const confirmed = window.confirm(`Hapus booking atas nama ${booking.name || "pemesan ini"}?`);
  if (!confirmed) return;

  hideMessage();

  try {
    await apiRequest(`/bookings/${encodeURIComponent(booking.id)}`, {
      method: "DELETE",
    });
    showMessage("Booking berhasil dihapus.", "success");

    if (state.bookings.length === 1 && state.pagination.page > 1) {
      state.pagination.page -= 1;
    }

    await loadBookings();
  } catch (error) {
    showMessage(error.message || "Gagal menghapus booking.", "error");
  }
}

async function exportBookings() {
  hideMessage();
  elements.exportButton.disabled = true;
  elements.exportButton.textContent = "Mengexport...";

  try {
    const query = buildFilterQuery({ includePagination: false });
    const response = await fetch(`${API_BASE_URL}/bookings/export${query}`, {
      headers: { Accept: "text/csv" },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.message || `Export gagal (${response.status})`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "travelku-bookings.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage("CSV berhasil dibuat.", "success");
  } catch (error) {
    showMessage(error.message || "Gagal export CSV.", "error");
  } finally {
    elements.exportButton.disabled = false;
    elements.exportButton.textContent = "Export CSV";
  }
}

function startEdit(booking) {
  state.editingId = booking.id;
  elements.inputs.id.value = booking.id;
  elements.inputs.name.value = booking.name;
  elements.inputs.email.value = booking.email;
  elements.inputs.phone.value = booking.phone;
  elements.inputs.package.value = booking.packageId || findPackageIdByName(booking.package) || "";
  elements.inputs.date.value = toInputDate(booking.date);
  elements.inputs.guests.value = booking.guests || 1;
  elements.inputs.price.value = booking.price || 0;
  elements.inputs.notes.value = booking.notes || "";
  elements.formTitle.textContent = "Edit Booking";
  elements.submitButton.textContent = "Update Booking";
  elements.cancelEditButton.classList.remove("hidden");
  elements.inputs.name.focus();
}

function resetForm() {
  state.editingId = null;
  elements.form.reset();
  elements.inputs.id.value = "";
  elements.formTitle.textContent = "Tambah Booking";
  elements.submitButton.textContent = "Simpan Booking";
  elements.cancelEditButton.classList.add("hidden");
  clearValidationErrors();
  setDefaultDate();
}

function clearFilters() {
  elements.filterSearch.value = "";
  elements.filterStatus.value = "";
  elements.filterPackage.value = "";
  elements.filterStartDate.value = "";
  elements.filterEndDate.value = "";
  resetPageAndLoad();
}

function resetPageAndLoad() {
  state.pagination.page = 1;
  loadBookings();
}

function handlePackageChange() {
  const selectedPackage = findPackageById(elements.inputs.package.value);
  if (!selectedPackage) return;

  if (!elements.inputs.price.value || Number(elements.inputs.price.value) === 0) {
    elements.inputs.price.value = Math.round(selectedPackage.price_per_person);
  }
}

function renderBookings(bookings) {
  elements.tableBody.innerHTML = "";

  if (!bookings.length) {
    const row = document.createElement("tr");
    row.className = "empty-row";
    row.innerHTML = '<td colspan="7" class="empty-cell">Belum ada data booking.</td>';
    elements.tableBody.appendChild(row);
    return;
  }

  const fragment = document.createDocumentFragment();

  bookings.forEach((booking) => {
    const row = elements.rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.id = booking.id;
    row.querySelector('[data-field="name"]').textContent = booking.name || "-";
    row.querySelector('[data-field="contact"]').textContent = booking.contact || "-";
    row.querySelector('[data-field="package"]').textContent = booking.package || "-";
    row.querySelector('[data-field="date"]').textContent = dateFormat(booking.date);
    row.querySelector('[data-field="guests"]').textContent = numberFormat(booking.guests || 0);
    row.querySelector('[data-field="price"]').textContent = currencyFormat(booking.price || 0);

    const statusSelect = row.querySelector('[data-action="status"]');
    configureStatusSelect(statusSelect, booking.status || "Menunggu");

    fragment.appendChild(row);
  });

  elements.tableBody.appendChild(fragment);
}

function configureStatusSelect(select, currentStatus) {
  const nextStatuses = STATUS_TRANSITIONS[currentStatus] || [];
  const selectableStatuses = [currentStatus, ...nextStatuses];

  select.replaceChildren(
    ...selectableStatuses.map((status) => createOption(status, status)),
  );

  select.value = currentStatus;
  select.disabled = nextStatuses.length === 0;
  select.title = nextStatuses.length
    ? "Ubah status booking"
    : "Status akhir tidak bisa diubah";
}

function renderPagination() {
  const { page, limit, total, totalPages } = state.pagination;
  const firstItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const lastItem = Math.min(page * limit, total);

  elements.paginationSummary.textContent = total === 0
    ? "Menampilkan 0 data"
    : `Menampilkan ${numberFormat(firstItem)}-${numberFormat(lastItem)} dari ${numberFormat(total)} data`;
  elements.pageIndicator.textContent = `Halaman ${numberFormat(page)} dari ${numberFormat(totalPages)}`;
  elements.prevPageButton.disabled = page <= 1 || state.isLoading;
  elements.nextPageButton.disabled = page >= totalPages || state.isLoading;
  elements.pageSize.value = String(limit);
}

function renderComputedSummary(bookings) {
  const total = state.pagination.total || bookings.length;
  const pending = bookings.filter((booking) => booking.status === "Menunggu").length;
  const confirmed = bookings.filter((booking) => booking.status === "Dikonfirmasi").length;
  const revenue = bookings
    .filter((booking) => ["Dikonfirmasi", "Selesai"].includes(booking.status))
    .reduce((sum, booking) => sum + Number(booking.guests || 0) * Number(booking.price || 0), 0);

  elements.summaryTotal.textContent = numberFormat(total);
  elements.summaryPending.textContent = numberFormat(pending);
  elements.summaryConfirmed.textContent = numberFormat(confirmed);
  elements.summaryRevenue.textContent = currencyFormat(revenue);
}

function buildPayloadFromForm() {
  return {
    [FIELD_NAMES.name]: elements.inputs.name.value.trim(),
    [FIELD_NAMES.contact]: buildContactValue(),
    [FIELD_NAMES.packageId]: Number(elements.inputs.package.value),
    [FIELD_NAMES.date]: elements.inputs.date.value,
    [FIELD_NAMES.guests]: Number(elements.inputs.guests.value),
    [FIELD_NAMES.price]: Number(elements.inputs.price.value),
    [FIELD_NAMES.notes]: elements.inputs.notes.value.trim(),
  };
}

function buildContactValue() {
  return [elements.inputs.email.value.trim(), elements.inputs.phone.value.trim()]
    .filter(Boolean)
    .join(" | ");
}

function normalizeBooking(raw) {
  const contact = readField(raw, FIELD_ALIASES.contact) || "";
  const [primaryContact, secondaryContact = ""] = String(contact).split(" | ");

  return {
    raw,
    id: readField(raw, FIELD_ALIASES.id),
    name: readField(raw, FIELD_ALIASES.name) || "",
    contact,
    email: primaryContact,
    phone: secondaryContact,
    packageId: readField(raw, FIELD_ALIASES.packageId),
    package: readField(raw, FIELD_ALIASES.package) || "",
    date: readField(raw, FIELD_ALIASES.date) || "",
    guests: Number(readField(raw, FIELD_ALIASES.guests) || 0),
    price: Number(readField(raw, FIELD_ALIASES.price) || 0),
    status: readField(raw, FIELD_ALIASES.status) || "Menunggu",
    notes: readField(raw, FIELD_ALIASES.notes) || "",
    createdAt: readField(raw, FIELD_ALIASES.createdAt) || "",
  };
}

function readField(source, keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
}

function extractBookings(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.bookings)) return response.bookings;
  if (Array.isArray(response?.rows)) return response.rows;
  if (Array.isArray(response?.result)) return response.result;
  return [];
}

function extractPackages(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.packages)) return response.packages;
  return [];
}

function extractPagination(response, fallback) {
  const pagination = response?.pagination || {};

  return {
    page: Number(pagination.page || fallback.page || 1),
    limit: Number(pagination.limit || fallback.limit || 10),
    total: Number(pagination.total || 0),
    totalPages: Number(pagination.totalPages || pagination.total_pages || 1),
  };
}

function extractSummary(response) {
  if (!response || Array.isArray(response)) return null;
  return response.summary || response.data || response.result || response;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "string"
        ? data
        : data?.message || data?.error || Object.values(data?.errors || {})[0] || `Request gagal (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function buildFilterQuery({ includePagination } = { includePagination: false }) {
  const filters = getFilters();
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.package) params.set("package", filters.package);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);

  if (includePagination) {
    params.set("page", String(state.pagination.page));
    params.set("limit", String(state.pagination.limit));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function getFilters() {
  return {
    search: elements.filterSearch.value.trim(),
    status: elements.filterStatus.value,
    package: elements.filterPackage.value.trim(),
    startDate: elements.filterStartDate.value,
    endDate: elements.filterEndDate.value,
  };
}

function validateForm() {
  const errors = [];
  const values = {
    name: elements.inputs.name.value.trim(),
    contact: elements.inputs.email.value.trim(),
    packageId: elements.inputs.package.value,
    date: elements.inputs.date.value,
    guests: Number(elements.inputs.guests.value),
    price: Number(elements.inputs.price.value),
  };
  const selectedPackage = findPackageById(values.packageId);

  if (!values.name) errors.push(["customerName", "Nama pemesan wajib diisi."]);
  if (!values.contact) errors.push(["customerEmail", "Kontak utama wajib diisi."]);
  if (!values.packageId) errors.push(["packageSelect", "Paket travel wajib dipilih."]);
  if (!values.date) errors.push(["bookingDate", "Tanggal keberangkatan wajib diisi."]);
  if (!Number.isInteger(values.guests) || values.guests < 1) {
    errors.push(["guestCount", "Jumlah peserta minimal 1."]);
  }
  if (selectedPackage && values.guests > Number(selectedPackage.capacity)) {
    errors.push(["guestCount", `Jumlah peserta melebihi kuota paket (${numberFormat(selectedPackage.capacity)}).`]);
  }
  if (!Number.isFinite(values.price) || values.price < 0) {
    errors.push(["estimatedPrice", "Estimasi harga tidak valid."]);
  }

  return errors;
}

function showValidationErrors(errors) {
  errors.forEach(([fieldId, message]) => {
    const errorElement = document.querySelector(`[data-error-for="${fieldId}"]`);
    if (errorElement) errorElement.textContent = message;
  });
}

function clearValidationErrors() {
  document.querySelectorAll(".error-text").forEach((element) => {
    element.textContent = "";
  });
}

function showMessage(message, type = "info") {
  elements.messageBox.textContent = message;
  elements.messageBox.className = `message ${type}`;
}

function hideMessage() {
  elements.messageBox.textContent = "";
  elements.messageBox.className = "message hidden";
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  elements.refreshButton.disabled = isLoading;
  elements.refreshButton.textContent = isLoading ? "Memuat..." : "Refresh";
  renderPagination();
}

function setFormBusy(isBusy) {
  elements.submitButton.disabled = isBusy;
  elements.submitButton.textContent = isBusy
    ? "Menyimpan..."
    : state.editingId
      ? "Update Booking"
      : "Simpan Booking";
}

function setApiStatus(isOnline, text) {
  elements.apiStatus.classList.toggle("online", isOnline);
  elements.apiStatus.classList.toggle("offline", !isOnline);
  elements.apiStatus.querySelector("span:last-child").textContent = text;
}

function setDefaultDate() {
  if (!elements.inputs.date.value) {
    elements.inputs.date.value = new Date().toISOString().slice(0, 10);
  }
}

function findBookingById(id) {
  return state.bookings.find((booking) => String(booking.id) === String(id));
}

function findPackageById(id) {
  return state.packages.find((packageItem) => String(packageItem.id) === String(id));
}

function findPackageIdByName(name) {
  return state.packages.find((packageItem) => packageItem.name === name)?.id;
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function toInputDate(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function dateFormat(value) {
  const inputDate = toInputDate(value);
  if (!inputDate) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${inputDate}T00:00:00`));
}

function currencyFormat(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function numberFormat(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value || 0));
}

function debounce(callback, delay) {
  let timerId;
  return (...args) => {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => callback(...args), delay);
  };
}
