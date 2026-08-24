const express = require('express');
const {
  markDoctorLeave,
  listDoctors,
  listPendingDoctors,
  approveDoctor,
  rejectDoctor,
  updateDoctorSchedule,
  listPendingLeaves,
  approveLeaveRequest,
  rejectLeaveRequest,
} = require('../controllers/adminController');
const { authenticate, isAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/doctors', authenticate, isAdmin, listDoctors);
router.get('/doctors/pending', authenticate, isAdmin, listPendingDoctors);
router.post('/doctors/:doctorId/approve', authenticate, isAdmin, approveDoctor);
router.post('/doctors/:doctorId/reject', authenticate, isAdmin, rejectDoctor);
router.put('/doctors/:doctorId/schedule', authenticate, isAdmin, updateDoctorSchedule);
router.post('/doctors/:doctorId/leaves', authenticate, isAdmin, markDoctorLeave);

router.get('/leaves/pending', authenticate, isAdmin, listPendingLeaves);
router.post('/leaves/:leaveId/approve', authenticate, isAdmin, approveLeaveRequest);
router.post('/leaves/:leaveId/reject', authenticate, isAdmin, rejectLeaveRequest);

module.exports = router;
