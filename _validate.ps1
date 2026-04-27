param([string]$File = 'install.ps1')
$errors = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile($File, [ref]$null, [ref]$errors)
Write-Output "$File : $($errors.Count) errors"
if ($errors.Count -gt 0) {
    $errors | Select-Object -First 8 | ForEach-Object {
        Write-Output "  Line $($_.Extent.StartLineNumber): $($_.ErrorId)"
    }
}
