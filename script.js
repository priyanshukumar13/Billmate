const modal = document.getElementById("featureModal");
const modalTitle = document.getElementById("modalTitle");
const modalDescription = document.getElementById("modalDescription");
const modalFields = document.getElementById("modalFields");
const closeModal = document.getElementById("closeModal");

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const saveBtn = document.getElementById("saveBtn");
const submitBtn = document.getElementById("submitBtn");
const featureForm = document.getElementById("featureForm");

const featureSteps = [
  {
    key: "Automated Reminders",
    title: "Set Automated Reminder",
    description: "Never forget a bill! Set how and when you want reminders.",
    fields: [
      { type: "text", placeholder: "Bill Name" },
      { type: "number", placeholder: "Amount" },
      { type: "date", placeholder: "Due Date" },
      { type: "select", options: ["Email", "SMS", "App Notification"] }
    ]
  },
  {
    key: "Easy Scheduling",
    title: "Easy Scheduling",
    description: "Choose your billing frequency and start date.",
    fields: [
      { type: "select", options: ["Weekly", "Monthly", "Yearly"] },
      { type: "date", placeholder: "Start Date" }
    ]
  },
  {
    key: "Personalized Messages",
    title: "Personalized Messages",
    description: "Add names, emojis, and custom messages.",
    fields: [
      { type: "text", placeholder: "Recipient Name" },
      { type: "text", placeholder: "Message" },
      { type: "text", placeholder: "Emojis (optional)" }
    ]
  }
];

let currentStep = 0;
const formData = {};

function loadStep(stepIndex) {
  const step = featureSteps[stepIndex];
  if (!step) return;

  modalTitle.textContent = step.title;
  modalDescription.textContent = step.description;
  modalFields.innerHTML = "";

  step.fields.forEach((field, index) => {
    let input;
    if (field.type === "select") {
      input = document.createElement("select");
      input.name = `${step.key}_${index}`;
      field.options.forEach(opt => {
        const option = document.createElement("option");
        option.value = opt;
        option.text = opt;
        input.appendChild(option);
      });
    } else {
      input = document.createElement("input");
      input.type = field.type;
      input.placeholder = field.placeholder;
      input.name = `${step.key}_${index}`;
    }

    // If previously saved
    if (formData[input.name]) input.value = formData[input.name];

    modalFields.appendChild(input);
  });

  // Update button visibility
  prevBtn.classList.toggle("hidden", stepIndex === 0);
  nextBtn.classList.toggle("hidden", stepIndex === featureSteps.length - 1);
  submitBtn.classList.toggle("hidden", stepIndex !== featureSteps.length - 1);
}

function featureClicked(featureName) {
  if (featureName !== "Automated Reminders") return;
  currentStep = 0;
  loadStep(currentStep);
  modal.classList.remove("hidden");
}

closeModal.onclick = () => modal.classList.add("hidden");

prevBtn.onclick = () => {
  currentStep--;
  loadStep(currentStep);
};

nextBtn.onclick = () => {
  currentStep++;
  loadStep(currentStep);
};

saveBtn.onclick = () => {
  const inputs = modalFields.querySelectorAll("input, select");
  inputs.forEach(input => {
    formData[input.name] = input.value;
  });
  alert("Step data saved!");
};

featureForm.addEventListener("submit", function (e) {
  e.preventDefault();
  const inputs = modalFields.querySelectorAll("input, select");
  inputs.forEach(input => {
    formData[input.name] = input.value;
  });

  modal.classList.add("hidden");
  console.log("Final Submitted Data:", formData);
  alert("All steps completed and data submitted successfully!");
});
function openModal(id) {
  document.getElementById(id).style.display = "block";
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
}
