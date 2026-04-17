#include "WS_GPIO.h"

void digitalToggle(int pin) { digitalWrite(pin, !digitalRead(pin)); }

void RGB_Light(uint8_t red_val, uint8_t green_val, uint8_t blue_val) {
  neopixelWrite(GPIO_PIN_RGB, green_val, red_val, blue_val);
}

void Buzzer_PWM(uint16_t Time) {
  ledcWrite(GPIO_PIN_Buzzer, Dutyfactor);
  delay(Time);
  ledcWrite(GPIO_PIN_Buzzer, 0);
}

void GPIO_Init() {
  pinMode(GPIO_PIN_CH1, OUTPUT);
  pinMode(GPIO_PIN_CH2, OUTPUT);
  pinMode(GPIO_PIN_CH3, OUTPUT);
  pinMode(GPIO_PIN_CH4, OUTPUT);
  pinMode(GPIO_PIN_CH5, OUTPUT);
  pinMode(GPIO_PIN_CH6, OUTPUT);
  pinMode(GPIO_PIN_RGB, OUTPUT);
  pinMode(GPIO_PIN_Buzzer, OUTPUT);

  ledcAttachChannel(GPIO_PIN_Buzzer, Frequency, Resolution, PWM_Channel);
}
