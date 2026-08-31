// public/js/app.js
// Vanilla JS: mobile nav toggle + client-side validation for the
// Apply Leave form (the server re-validates everything regardless) +
// show/hide the rejection-reason box on the Approvals page.

document.addEventListener('DOMContentLoaded', function () {
  // Mobile nav toggle
  var navToggle = document.getElementById('navToggle');
  var topbarNav = document.getElementById('topbarNav');

  if (navToggle && topbarNav) {
    navToggle.addEventListener('click', function () {
      var isOpen = topbarNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', isOpen);
    });
  }

  // Apply Leave form validation
  var applyLeaveForm = document.getElementById('applyLeaveForm');

  if (applyLeaveForm) {
    applyLeaveForm.addEventListener('submit', function (event) {
      var leaveType = document.getElementById('leaveType').value;
      var fromDate = document.getElementById('fromDate').value;
      var toDate = document.getElementById('toDate').value;
      var reason = document.getElementById('reason').value.trim();
      var errors = [];

      if (!leaveType) {
        errors.push('Please select a leave type.');
      }
      if (!fromDate || !toDate) {
        errors.push('Please provide both a From Date and a To Date.');
      } else if (new Date(toDate) < new Date(fromDate)) {
        errors.push('To Date cannot be earlier than From Date.');
      }
      if (!reason) {
        errors.push('Please provide a reason for the leave.');
      }

      if (errors.length > 0) {
        event.preventDefault();
        alert(errors.join('\n'));
      }
    });
  }

  // Approvals page: reveal the rejection-reason box for a given row
  // instead of submitting a Reject decision with no reason.
  var rejectToggles = document.querySelectorAll('.reject-toggle');

  rejectToggles.forEach(function (toggle) {
    toggle.addEventListener('click', function () {
      var target = document.getElementById(toggle.getAttribute('data-target'));
      if (target) {
        target.hidden = !target.hidden;
      }
    });
  });
});
