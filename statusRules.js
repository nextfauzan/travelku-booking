const bookingStatuses = ['Menunggu', 'Dikonfirmasi', 'Selesai', 'Dibatalkan'];

const allowedTransitions = {
  Menunggu: ['Dikonfirmasi', 'Dibatalkan'],
  Dikonfirmasi: ['Selesai', 'Dibatalkan'],
  Selesai: [],
  Dibatalkan: []
};

function getAllowedTransitions(status) {
  return allowedTransitions[status] || [];
}

function canTransitionStatus(currentStatus, nextStatus) {
  return getAllowedTransitions(currentStatus).includes(nextStatus);
}

module.exports = {
  bookingStatuses,
  allowedTransitions,
  getAllowedTransitions,
  canTransitionStatus
};
