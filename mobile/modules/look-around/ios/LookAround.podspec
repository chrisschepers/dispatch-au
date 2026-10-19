Pod::Spec.new do |s|
  s.name           = 'LookAround'
  s.version        = '1.0.0'
  s.summary        = 'Apple Look Around (straatbeeld) voor 112 Meldingen'
  s.description    = 'Maakt een momentopname van Apple Look Around en opent het panorama.'
  s.license        = 'UNLICENSED'
  s.author         = 'Chris Schepers'
  s.homepage       = 'https://alarmeringenp2000.nl'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
